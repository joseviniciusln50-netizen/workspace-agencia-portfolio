"use server";

import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPlausibleEmail, passwordProblem } from "@/lib/auth/password";
import { HOME_PATH, LOGIN_NOTICES, PASSWORD_SETUP_PATH, safeNextPath } from "@/lib/auth/routes";
import { isPlausibleCode } from "@/lib/admin/rules";
import { displayNameProblem, normalizeDisplayName } from "@/lib/profile/rules";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * Ações de servidor das telas de acesso.
 * - Tudo é validado AQUI (no servidor); o formulário é só conveniência.
 * - Senhas nunca são devolvidas ao navegador nem registradas em log.
 * - Mensagens genéricas: não revelam se um e-mail tem conta.
 */

export interface FormState {
  error?: string;
  email?: string;
  sent?: boolean;
  /** Ativação: devolvidos para o formulário não perder o que foi digitado após um erro (senhas nunca voltam). */
  name?: string;
  code?: string;
}

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function signInMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Este e-mail ainda não foi confirmado. Use o link do convite.";
    case "user_banned":
      return LOGIN_NOTICES.desativada;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    default:
      return error.status === 429
        ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
        : "Não foi possível entrar agora. Tente novamente.";
  }
}

/** Login por e-mail e senha. Contas desativadas ou sem perfil são deslogadas na hora. */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email").trim().toLowerCase();
  const password = field(formData, "password");
  const next = safeNextPath(field(formData, "next"), HOME_PATH);

  if (!isPlausibleEmail(email) || !password) return { error: "Informe seu e-mail e sua senha.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: error ? signInMessage(error) : "Não foi possível entrar agora.", email };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: LOGIN_NOTICES["sem-perfil"], email };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: LOGIN_NOTICES.desativada, email };
  }

  redirect(next);
}

/** Origem do site para os links de e-mail. O Supabase só aceita destinos da lista "Redirect URLs". */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  return h.get("origin") ?? "http://localhost:3000";
}

/** Envia o link de recuperação. Resposta sempre igual (não revela se o e-mail existe). */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email").trim().toLowerCase();
  if (!isPlausibleEmail(email)) return { error: "Informe um e-mail válido.", email };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(PASSWORD_SETUP_PATH)}`,
  });
  // Erro só no log do servidor (sem o e-mail); para a pessoa, a mesma resposta de sempre.
  if (error) console.error("[recuperar-senha] falha ao solicitar o link:", error.code ?? error.status);

  return { sent: true };
}

/**
 * Primeiro acesso com CÓDIGO DE ATIVAÇÃO (sem SMTP e sem cadastro público).
 * 1. Valida os campos.  2. O banco confere e-mail + código e RESERVA o convite (uso único; 5 tentativas).
 * 3. O servidor cria a conta com a chave secreta (e-mail já confirmado; nome nos metadados).
 *    O gatilho do banco cria o perfil SEMPRE como colaborador.  4. Conclui o convite e entra.
 * Falhas → mensagem genérica (não revela se o e-mail tem convite).
 */
export async function activateAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = normalizeDisplayName(field(formData, "full_name"));
  const email = field(formData, "email").trim().toLowerCase();
  const code = field(formData, "code");
  const password = field(formData, "password");
  const confirmation = field(formData, "confirmation");
  const keep = { email, name, code: code.trim().slice(0, 12) };

  const problem =
    displayNameProblem(name) ??
    (!isPlausibleEmail(email) ? "Informe um e-mail válido." : null) ??
    (!isPlausibleCode(code) ? "Confira o código de ativação (8 caracteres)." : null) ??
    passwordProblem(password, confirmation);
  if (problem) return { error: problem, ...keep };

  if (!hasAdminKey()) {
    console.error("[ativar] SUPABASE_SECRET_KEY ausente");
    return { error: "Ativação indisponível no momento. Fale com um administrador.", ...keep };
  }

  const GENERIC = "Não foi possível ativar. Confira o e-mail e o código, ou peça um novo código ao administrador.";
  const admin = createAdminClient();
  const { data: inviteId, error: claimError } = await admin.rpc("claim_invite", { p_email: email, p_code: code });
  if (claimError || typeof inviteId !== "string") return { error: GENERIC, ...keep };

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (created.error || !created.data.user) {
    await admin.rpc("release_invite", { invite: inviteId });
    if (created.error?.code === "weak_password") {
      return { error: "Senha fraca. Use pelo menos 10 caracteres, com letras e números.", ...keep };
    }
    return { error: GENERIC, ...keep };
  }
  await admin.rpc("finish_invite", { invite: inviteId, new_user: created.data.user.id });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/entrar?motivo=senha-definida");
  redirect(HOME_PATH);
}

/** Define a nova senha (após link de recuperação ou convite — a sessão vem do link). */
export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = field(formData, "password");
  const confirmation = field(formData, "confirmation");

  const problem = passwordProblem(password, confirmation);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/entrar?motivo=link-invalido");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { error: "Senha fraca. Use pelo menos 10 caracteres, com letras e números." };
    if (error.code === "reauthentication_needed") return { error: "Por segurança, solicite um novo link de recuperação." };
    return { error: "Não foi possível salvar a senha. Tente novamente." };
  }

  redirect(HOME_PATH);
}
