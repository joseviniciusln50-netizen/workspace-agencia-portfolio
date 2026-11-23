import "server-only";
import webpush from "web-push";
import type { SessionUser } from "@/lib/auth/access";
import type { RawEvent, TaskRef } from "@/lib/mural/notifications";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { isAllowedEndpoint, pushRecipients, recordingPushRecipients, type PushMessage } from "./rules";

type UserClient = Awaited<ReturnType<typeof createClient>>;

const SEND_TIMEOUT_MS = 2500;

/** Push só funciona com as duas chaves VAPID e a chave secreta do Supabase (para achar os aparelhos). */
export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && hasAdminKey());
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  // "subject" identifica o remetente para os serviços de push: o endereço do site (sem e-mail pessoal).
  const subject = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ? process.env.NEXT_PUBLIC_SITE_URL : "https://workspace.example.com";
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  vapidReady = true;
}

/** Envia as mensagens para todos os aparelhos das pessoas. Nunca lança erro. */
export async function sendToPeople(messages: Map<string, PushMessage>): Promise<{ sent: number; failed: number }> {
  if (messages.size === 0 || !pushConfigured()) return { sent: 0, failed: 0 };
  try {
    ensureVapid();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("push_targets", { p_profiles: [...messages.keys()] });
    if (error || !data) return { sent: 0, failed: 0 };

    const rows = (data as { profile_id: string; endpoint: string; p256dh: string; auth: string }[]).filter((r) => isAllowedEndpoint(r.endpoint));
    const results = await Promise.allSettled(
      rows.map((r) =>
        withTimeout(
          webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify(messages.get(r.profile_id)), {
            TTL: 24 * 60 * 60,
            urgency: "normal",
          }),
        ).catch(async (e: { statusCode?: number }) => {
          // 404/410: o aparelho cancelou ou a inscrição expirou → limpa
          if (e?.statusCode === 404 || e?.statusCode === 410) await admin.rpc("push_drop", { p_endpoint: r.endpoint });
          throw e;
        }),
      ),
    );
    const sent = results.filter((x) => x.status === "fulfilled").length;
    return { sent, failed: results.length - sent };
  } catch {
    return { sent: 0, failed: 0 };
  }
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), SEND_TIMEOUT_MS))]);
}

/**
 * Depois de uma ação numa tarefa: lê (com o cliente do USUÁRIO → RLS) o que ele acabou de fazer
 * e avisa quem deve saber. `since` = início da ação (folga de 2 s para relógios diferentes).
 */
export async function notifyTaskAction(supabase: UserClient, me: SessionUser, taskId: string, since: number): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const [events, task, assignees] = await Promise.all([
      supabase
        .from("task_events")
        .select("id, task_id, actor_id, kind, details, created_at")
        .eq("task_id", taskId)
        .eq("actor_id", me.id)
        .gte("created_at", new Date(since - 2000).toISOString())
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("tasks").select("id, title, created_by").eq("id", taskId).maybeSingle(),
      supabase.from("task_assignees").select("profile_id").eq("task_id", taskId),
    ]);
    if (!task.data || !events.data?.length) return;

    const raw: RawEvent[] = events.data.map((r) => ({
      id: r.id as number,
      taskId: r.task_id as string,
      actorId: r.actor_id as string,
      kind: r.kind as string,
      details: (r.details as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at as string,
    }));
    const ref: TaskRef = {
      id: task.data.id as string,
      title: task.data.title as string,
      createdBy: task.data.created_by as string,
      assigneeIds: (assignees.data ?? []).map((a) => a.profile_id as string),
    };
    await sendToPeople(pushRecipients(raw, ref, me.id, me.name));
  } catch {
    /* notificação é um extra: nunca atrapalha a ação */
  }
}

/** Depois de agendar/editar uma gravação: avisa no celular quem acabou de entrar na equipe. */
export async function notifyRecordingTeam(
  supabase: UserClient,
  me: SessionUser,
  recordingId: string,
  before: string[],
): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const [rec, team] = await Promise.all([
      supabase.from("recordings").select("id, title").eq("id", recordingId).maybeSingle(),
      supabase.from("recording_team").select("profile_id").eq("recording_id", recordingId),
    ]);
    if (!rec.data) return;
    const after = (team.data ?? []).map((t) => t.profile_id as string);
    await sendToPeople(recordingPushRecipients({ id: rec.data.id as string, title: rec.data.title as string }, before, after, me.id, me.name));
  } catch {
    /* notificação é um extra: nunca atrapalha a ação */
  }
}
