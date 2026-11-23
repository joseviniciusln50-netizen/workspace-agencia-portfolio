import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { LOGIN_NOTICES, LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Encerra a sessão quando o servidor descobre que ela não pode continuar
 * (conta desativada, perfil inexistente). Server Components não gravam cookies;
 * por isso a verificação em src/lib/auth/session.ts redireciona para cá.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const motivo = request.nextUrl.searchParams.get("motivo");
  // `redirect()` leva junto os cookies limpos pelo signOut.
  redirect(motivo && motivo in LOGIN_NOTICES ? `${LOGIN_PATH}?motivo=${motivo}` : LOGIN_PATH);
}
