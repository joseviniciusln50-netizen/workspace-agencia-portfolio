import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "./env";

/**
 * Cliente ADMINISTRATIVO (chave SECRETA → ignora o RLS). Uso restrito, só no servidor:
 * - ativação de conta por código (criar o usuário no Auth);
 * - bloquear/desbloquear login de quem foi desativado;
 * - listar e-mails das contas para a Administração (após conferir que quem pede é admin).
 * NUNCA importe em Client Components (o `server-only` quebra o build se isso acontecer).
 */
export function hasAdminKey(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  const { url } = requireSupabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY não configurada (.env.local / painel da hospedagem).");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
