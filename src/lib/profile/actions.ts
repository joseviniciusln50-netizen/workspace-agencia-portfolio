"use server";

import { refresh } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  AVATAR_UPLOAD_MAX_BYTES,
  bioProblem,
  detectImageType,
  displayNameProblem,
  EXTENSION,
  isOwnAvatarPath,
  normalizeBio,
  normalizeDisplayName,
} from "./rules";

/*
 * Ações do PRÓPRIO perfil. Segurança em camadas:
 * 1. getSessionUser() reconfere a identidade no servidor (conta ativa).
 * 2. Tudo é gravado com o cliente do USUÁRIO (chave publicável + sessão) → o RLS do banco decide.
 *    O banco só deixa editar o próprio nome, descrição e foto (colunas + políticas + constraints).
 * 3. Nível de acesso e funções profissionais NÃO são aceitos aqui (nem existem nos formulários).
 */

export interface ProfileFormState {
  error?: string;
  saved?: boolean;
  name?: string;
  bio?: string;
}

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await getSessionUser();
  const name = normalizeDisplayName(field(formData, "full_name"));
  const bio = normalizeBio(field(formData, "bio"));

  const problem = displayNameProblem(name) ?? bioProblem(bio);
  if (problem) return { error: problem, name, bio };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name, bio }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar agora. Tente novamente.", name, bio };

  refresh(); // atualiza nome na barra lateral, saudação e Equipe
  return { saved: true, name, bio };
}

export interface AvatarResult {
  ok: boolean;
  error?: string;
}

/** Recebe a foto JÁ recortada/reduzida no navegador; confere tipo real e tamanho; grava na pasta do usuário. */
export async function uploadAvatar(formData: FormData): Promise<AvatarResult> {
  const user = await getSessionUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Escolha uma imagem." };
  if (file.size > AVATAR_UPLOAD_MAX_BYTES) return { ok: false, error: "A imagem ficou grande demais. Tente outra foto." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageType(bytes);
  if (!mime) return { ok: false, error: "Formato não aceito. Use JPEG, PNG ou WebP." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).single();

  // Nome novo a cada envio (evita cache de foto antiga); sempre dentro da pasta do usuário.
  const path = `${user.id}/${crypto.randomUUID().replace(/-/g, "")}.${EXTENSION[mime]}`;
  const up = await supabase.storage.from("avatars").upload(path, bytes, {
    contentType: mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (up.error) return { ok: false, error: "Não foi possível enviar a foto. Tente novamente." };

  const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
  if (error) {
    await supabase.storage.from("avatars").remove([path]);
    return { ok: false, error: "Não foi possível salvar a foto. Tente novamente." };
  }

  // Apaga a foto anterior (economiza armazenamento). Falha aqui não afeta o usuário.
  const old = current?.avatar_url as string | null | undefined;
  if (old && old !== path && isOwnAvatarPath(old, user.id)) await supabase.storage.from("avatars").remove([old]);

  refresh();
  return { ok: true };
}

export async function removeAvatar(): Promise<AvatarResult> {
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: current } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).single();

  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível remover a foto agora." };

  const old = current?.avatar_url as string | null | undefined;
  if (old && isOwnAvatarPath(old, user.id)) await supabase.storage.from("avatars").remove([old]);

  refresh();
  return { ok: true };
}
