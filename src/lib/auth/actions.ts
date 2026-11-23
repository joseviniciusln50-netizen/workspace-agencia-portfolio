"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão (revoga o refresh token no Supabase e limpa os cookies). */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar?motivo=saiu");
}
