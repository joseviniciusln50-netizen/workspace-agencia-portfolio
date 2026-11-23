import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "./env";

/**
 * Cliente do Supabase para Client Components (ex.: tempo real, uploads — etapas seguintes).
 * Usa só a chave PUBLICÁVEL; o que cada usuário pode ver é decidido pelo RLS no banco.
 */
export function createClient() {
  const { url, key } = requireSupabaseEnv();
  return createBrowserClient(url, key);
}
