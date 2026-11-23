import { NextResponse, type NextRequest } from "next/server";
import {
  hasSupabaseAuthCookie,
  HOME_PATH,
  isAuthRoute,
  isPublicPath,
  isStaticAsset,
  LOGIN_PATH,
  PASSWORD_SETUP_PATH,
} from "@/lib/auth/routes";
import { supabaseEnv } from "@/lib/supabase/env";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Porta de entrada de TODAS as requisições (sem `matcher`). Na Netlify roda como Edge Function.
 *
 * Login real (Supabase): renova a sessão e protege as rotas privadas.
 * - FALHA FECHADA: sem as variáveis do Supabase, responde 503 (nunca abre sem proteção por engano).
 * - É um filtro OTIMISTA: cada leitura de dados confere a identidade de novo no servidor
 *   (src/lib/auth/session.ts) e o banco aplica RLS.
 *
 * A senha compartilhada da demonstração (HTTP Basic Auth) foi REMOVIDA em 15/11/2026 por decisão do
 * usuário: com login individual, ela obrigaria duas senhas e bloquearia o primeiro acesso por código.
 */

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Arquivos estáticos não dependem da sessão (a tela de login precisa deles).
  if (isStaticAsset(pathname)) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const env = supabaseEnv();
  if (!env) {
    return new NextResponse("Login indisponível: Supabase não configurado.", {
      status: 503,
      headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { response, userId } = await updateSession(request, env);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  // Confirmação de e-mail, encerramento de sessão: decidem sozinhos.
  if (isAuthRoute(pathname)) return response;

  // Telas de acesso: quem já está logado vai para o início.
  if (isPublicPath(pathname)) {
    return userId ? redirectWithCookies(new URL(HOME_PATH, request.url), response) : response;
  }

  // Demais rotas: exigem sessão válida.
  if (!userId) {
    const url = new URL(LOGIN_PATH, request.url);
    if (pathname === PASSWORD_SETUP_PATH) {
      url.searchParams.set("motivo", "link-invalido");
    } else {
      if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
      const cookieNames = request.cookies.getAll().map((c) => c.name);
      if (hasSupabaseAuthCookie(cookieNames)) url.searchParams.set("motivo", "expirada");
    }
    return redirectWithCookies(url, response);
  }

  return response;
}
