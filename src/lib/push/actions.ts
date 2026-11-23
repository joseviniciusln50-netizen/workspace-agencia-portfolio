"use server";

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEndpoint } from "./rules";
import { pushConfigured, sendToPeople } from "./send";

export interface PushResult {
  ok: boolean;
  error?: string;
}

interface SubscriptionJSON {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

/** Inscreve ESTE aparelho (função do banco → só para quem está logado). */
export async function savePushSubscription(sub: SubscriptionJSON, userAgent: string): Promise<PushResult> {
  await getSessionUser();
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!isAllowedEndpoint(endpoint) || !p256dh || !auth) return { ok: false, error: "Este navegador não forneceu uma inscrição válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_subscribe", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: String(userAgent ?? "").slice(0, 300),
  });
  return error ? { ok: false, error: "Não foi possível ativar as notificações." } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<PushResult> {
  await getSessionUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_unsubscribe", { p_endpoint: String(endpoint ?? "") });
  return error ? { ok: false, error: "Não foi possível desativar." } : { ok: true };
}

/** Notificação de teste para os aparelhos da PRÓPRIA pessoa. */
export async function sendTestPush(): Promise<PushResult> {
  const me = await getSessionUser();
  if (!pushConfigured()) return { ok: false, error: "As notificações ainda não estão configuradas no servidor." };
  const r = await sendToPeople(
    new Map([[me.id, { title: "Workspace", body: "Notificações ativadas neste aparelho.", url: "/dashboard", tag: "teste" }]]),
  );
  if (r.sent > 0) return { ok: true };
  return { ok: false, error: r.failed > 0 ? "O serviço de notificações recusou o envio. Desative e ative de novo." : "Nenhum aparelho ativado encontrado." };
}
