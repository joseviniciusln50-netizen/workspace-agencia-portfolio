import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { avatarSrc } from "@/lib/profile/rules";
import { createClient } from "@/lib/supabase/server";
import type { AccessLevel, SessionUser } from "./access";
import { LOGIN_PATH } from "./routes";

/**
 * Camada de acesso a dados (DAL): ÚNICO lugar que decide "quem é o usuário".
 * - `getClaims()` valida a assinatura do token no servidor (nunca `getSession()`).
 * - Confere o perfil no banco: conta desativada ou sem perfil → encerra a sessão.
 * Chame em toda página/ação que precise do usuário; o `cache` evita repetir na mesma requisição.
 */
export const getSessionUser = cache(async (): Promise<SessionUser> => {
  // A validação do token compara a validade com a hora atual (Date.now()): só no momento da
  // requisição, nunca em pré-renderização (Cache Components avisa no modo dev).
  await connection();
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) redirect(LOGIN_PATH);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, access_level, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  // Encerrar a sessão exige gravar cookies → feito pela rota /auth/encerrar.
  if (error || !profile) redirect("/auth/encerrar?motivo=sem-perfil");
  if (!profile.is_active) redirect("/auth/encerrar?motivo=desativada");

  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    id: profile.id as string,
    name: (profile.full_name as string) || email.split("@")[0] || "Usuário",
    email,
    accessLevel: profile.access_level as AccessLevel,
    avatarUrl: avatarSrc(profile.id as string, profile.avatar_url as string | null),
  };
});
