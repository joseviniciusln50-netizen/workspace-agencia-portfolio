import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "./env";

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a chave PUBLICÁVEL + o cookie de sessão do usuário: tudo passa pelo RLS.
 * Crie um novo a cada uso (não guarde em variável global).
 */
export async function createClient() {
  const { url, key } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component (não pode gravar cookies).
          // Sem problema: o proxy (src/proxy.ts) renova a sessão a cada requisição.
        }
      },
    },
  });
}
