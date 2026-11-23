/**
 * Variáveis PÚBLICAS do Supabase (podem ir ao navegador: o acesso real é limitado pelo RLS).
 * A chave secreta (SUPABASE_SECRET_KEY, Etapa B) NUNCA deve ter prefixo NEXT_PUBLIC_.
 *
 * Leitura com nome literal: o Next só embute no código do navegador `process.env.NEXT_PUBLIC_X`
 * escrito por extenso.
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function requireSupabaseEnv(): { url: string; key: string } {
  const env = supabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local.",
    );
  }
  return env;
}
