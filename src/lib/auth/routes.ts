/**
 * Regras de rota da autenticação (puras: sem Next, sem Supabase — testadas no Vitest).
 */

/** Telas abertas a quem NÃO está logado. */
const PUBLIC_PATHS = ["/entrar", "/recuperar-senha", "/ativar"];

/** Rotas técnicas do fluxo de login (confirmação de e-mail, encerramento de sessão). */
const AUTH_ROUTE_PREFIX = "/auth/";

/** Precisa de sessão, mas é parte do fluxo de senha (link de recuperação/convite). */
export const PASSWORD_SETUP_PATH = "/redefinir-senha";

export const LOGIN_PATH = "/entrar";
export const HOME_PATH = "/dashboard";

/** Arquivos estáticos: não precisam de sessão do Supabase (a Basic Auth da demo continua cobrindo). */
export function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sw.js" || // service worker (só notificações): o navegador o busca sem sessão
    /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|txt|webmanifest)$/i.test(pathname)
  );
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith(AUTH_ROUTE_PREFIX);
}

/**
 * Destino seguro após o login: só caminhos INTERNOS do app.
 * Bloqueia URLs absolutas, "//host", "/\host", esquemas e as próprias telas de login.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string = HOME_PATH): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://interno.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://interno.invalid") return fallback;
  if (isPublicPath(url.pathname) || isAuthRoute(url.pathname)) return fallback;
  return `${url.pathname}${url.search}`;
}

/** Cookies de sessão do Supabase (`sb-<ref>-auth-token`, possivelmente fatiados em `.0`, `.1`…). */
export function hasSupabaseAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((n) => /^sb-[^-]+-auth-token(\.\d+)?$/.test(n));
}

/** Motivos exibidos na tela de login (via ?motivo=). */
export const LOGIN_NOTICES = {
  expirada: "Sua sessão expirou. Entre novamente.",
  saiu: "Você saiu do Workspace.",
  desativada: "Este acesso está desativado. Fale com um administrador.",
  "sem-perfil": "Seu acesso ainda não foi configurado. Fale com um administrador.",
  "link-invalido": "O link expirou ou já foi usado. Solicite um novo.",
  "senha-definida": "Senha definida. Entre com o seu e-mail e a nova senha.",
} as const;

export type LoginNotice = keyof typeof LOGIN_NOTICES;

export function loginNotice(raw: string | null | undefined): string | null {
  return raw && raw in LOGIN_NOTICES ? LOGIN_NOTICES[raw as LoginNotice] : null;
}
