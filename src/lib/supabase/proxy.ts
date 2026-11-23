import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada requisição (Server Components não gravam cookies)
 * e devolve se há um usuário com token VÁLIDO (`getClaims()` verifica a assinatura do JWT).
 *
 * Baseado no exemplo oficial `with-supabase`. Regra do Supabase: não rodar código entre
 * `createServerClient` e `getClaims()`, e devolver o `response` com os cookies intactos.
 */
export async function updateSession(request: NextRequest, env: { url: string; key: string }) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  return { response, userId };
}

/**
 * Redireciona preservando os cookies que o Supabase acabou de gravar/limpar
 * (sem isso, navegador e servidor ficam dessincronizados e a sessão cai).
 */
export function redirectWithCookies(url: URL, from: NextResponse) {
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  for (const h of ["cache-control", "expires", "pragma"]) {
    const v = from.headers.get(h);
    if (v) res.headers.set(h, v);
  }
  return res;
}
