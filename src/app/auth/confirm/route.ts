import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { HOME_PATH, PASSWORD_SETUP_PATH, safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino dos links enviados por e-mail (recuperação de senha e convite).
 * Valida o link NO SERVIDOR e cria a sessão. Aceita os dois formatos do Supabase:
 * - `token_hash` + `type` (modelos de e-mail personalizados — recomendado, funciona em qualquer navegador);
 * - `code` (fluxo PKCE padrão — só funciona no MESMO navegador que pediu o link).
 */
const ALLOWED_TYPES: EmailOtpType[] = ["recovery", "invite", "email"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Para onde ir depois: definir senha (recuperação/convite) ou uma rota interna segura.
  const wantsPasswordSetup = searchParams.get("next") === PASSWORD_SETUP_PATH || type === "recovery" || type === "invite";
  const destination = new URL(wantsPasswordSetup ? PASSWORD_SETUP_PATH : safeNextPath(searchParams.get("next"), HOME_PATH), request.url);
  if (type === "invite") destination.searchParams.set("tipo", "convite");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  // `redirect()` (e não um NextResponse novo) para levar junto os cookies da sessão recém-criada.
  if (!ok) redirect("/entrar?motivo=link-invalido");
  redirect(`${destination.pathname}${destination.search}`);
}
