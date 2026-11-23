"use server";

import { refresh } from "next/cache";
import type { AccessLevel } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/profile/rules";
import { inviteMessage, normalizeEmail, sanitizeRoles, shareableSiteUrl } from "./rules";

/*
 * Ações da Administração. Camadas de proteção:
 * 1. getSessionUser(): sessão válida e conta ativa.
 * 2. As mudanças passam por FUNÇÕES DO BANCO (rpc) que conferem o nível de quem chama
 *    (auth.uid()) — uma requisição manipulada não consegue pular essa checagem.
 * 3. A chave secreta só é usada para o que o banco não faz sozinho (bloquear login no Auth),
 *    e sempre DEPOIS de o banco autorizar a mudança.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Mensagens do banco (exceções em pt-BR) → texto para a interface. */
function dbError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  // As funções do banco lançam mensagens já escritas para pessoas.
  if (/[À-ú]|permissão|administrador|principal|membro|e-mail|função|senha|transfer/i.test(message)) return message;
  return fallback;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export interface InviteResult extends ActionResult {
  code?: string;
  email?: string;
  message?: string;
}

export async function createInvite(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  await getSessionUser();
  const raw = formData.get("email");
  const email = normalizeEmail(typeof raw === "string" ? raw : "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Informe um e-mail válido.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_invite", { p_email: email });
  if (error || typeof data !== "string") return { ok: false, error: dbError(error?.message, "Não foi possível criar o convite."), email };

  const site = shareableSiteUrl(process.env.NEXT_PUBLIC_SITE_URL); // nunca localhost: o link vai para o celular de outra pessoa
  refresh();
  return { ok: true, code: data, email, message: inviteMessage(data, site) };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  await getSessionUser();
  if (!isUuid(inviteId)) return { ok: false, error: "Convite inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_invite", { invite: inviteId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível cancelar o convite.") };
  refresh();
  return { ok: true };
}

export async function setRoles(targetId: string, roles: string[]): Promise<ActionResult> {
  await getSessionUser();
  if (!isUuid(targetId)) return { ok: false, error: "Membro inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_roles", { target: targetId, roles: sanitizeRoles(roles) });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível salvar as funções.") };
  refresh();
  return { ok: true };
}

export async function setAccessLevel(targetId: string, level: AccessLevel): Promise<ActionResult> {
  await getSessionUser();
  if (!isUuid(targetId) || (level !== "admin" && level !== "colaborador")) return { ok: false, error: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_access_level", { target: targetId, new_level: level });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível alterar o nível de acesso.") };
  refresh();
  return { ok: true };
}

export async function setActive(targetId: string, active: boolean): Promise<ActionResult> {
  await getSessionUser();
  if (!isUuid(targetId) || typeof active !== "boolean") return { ok: false, error: "Pedido inválido." };
  const supabase = await createClient();
  // 1º o banco autoriza e grava (regras de quem pode desativar quem).
  const { error } = await supabase.rpc("admin_set_active", { target: targetId, active });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível alterar o acesso.") };

  // 2º bloqueia/desbloqueia o LOGIN no Auth (impede novos tokens de quem foi desativado).
  //    Mesmo sem isso a pessoa já fica barrada (o Workspace confere "ativo" a cada acesso e o RLS bloqueia
  //    os dados), mas a falha NÃO pode passar em silêncio.
  refresh();
  if (!hasAdminKey()) {
    return { ok: false, error: "Status salvo, mas o bloqueio de login não foi aplicado: chave secreta ausente no servidor." };
  }
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(targetId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) {
    console.error("[admin] falha ao", active ? "desbloquear" : "bloquear", "login:", banError.code ?? banError.status);
    return { ok: false, error: "Status salvo, mas o bloqueio de login no Supabase falhou. Tente de novo." };
  }
  return { ok: true };
}

export interface ResetLinkResult extends ActionResult {
  link?: string;
  message?: string;
}

/**
 * Link de nova senha (sem SMTP). 1º o BANCO autoriza e registra (quem pode gerar para quem);
 * 2º o servidor gera o link com a chave secreta — o Supabase NÃO envia e-mail aqui.
 * O link passa pela nossa rota /auth/confirm (validado no servidor), vale ~1 hora e é de uso único.
 */
export async function generatePasswordResetLink(targetId: string): Promise<ResetLinkResult> {
  await getSessionUser();
  if (!isUuid(targetId)) return { ok: false, error: "Membro inválido." };
  if (!hasAdminKey()) return { ok: false, error: "Indisponível: chave secreta ausente no servidor." };

  const supabase = await createClient();
  const auth = await supabase.rpc("admin_authorize_password_reset", { target: targetId });
  if (auth.error) return { ok: false, error: dbError(auth.error.message, "Sem permissão para gerar o link.") };

  const admin = createAdminClient();
  const { data: user, error: userError } = await admin.auth.admin.getUserById(targetId);
  const targetEmail = user?.user?.email;
  if (userError || !targetEmail) return { ok: false, error: "Não foi possível localizar a conta." };

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: targetEmail });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { ok: false, error: "Não foi possível gerar o link agora." };

  const site = shareableSiteUrl(process.env.NEXT_PUBLIC_SITE_URL); // nunca localhost: o link vai para o celular de outra pessoa
  const link = `${site}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=%2Fredefinir-senha`;
  const message = [
    "Olá! Aqui está o link para criar uma nova senha no Workspace:",
    link,
    "Ele vale por cerca de 1 hora e só pode ser usado uma vez.",
  ].join("\n");
  return { ok: true, link, message };
}

/** Transferência do principal: exige digitar a SENHA de novo (o banco confere login ≤ 10 min). */
export async function transferPrincipal(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  const target = formData.get("target");
  const password = formData.get("password");
  if (!isUuid(target) || typeof password !== "string" || !password) return { ok: false, error: "Escolha a pessoa e confirme sua senha." };
  if (target === me.id) return { ok: false, error: "Escolha outra pessoa." };

  const supabase = await createClient();
  const reauth = await supabase.auth.signInWithPassword({ email: me.email, password });
  if (reauth.error) return { ok: false, error: "Senha incorreta." };

  const { error } = await supabase.rpc("transfer_principal", { target });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível transferir a função.") };
  refresh();
  return { ok: true };
}
