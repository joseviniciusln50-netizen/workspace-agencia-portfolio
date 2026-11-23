"use server";

import { getSessionUser } from "@/lib/auth/session";
import { avatarSrc } from "@/lib/profile/rules";
import { createClient } from "@/lib/supabase/server";
import { buildNotices, buildRecordingNotices, mergeNotices, type Notice, type RawEvent, type TeamAddition, type TaskRef } from "./notifications";

export interface NoticesPayload {
  notices: (Notice & { actorName: string; actorAvatar: string | null })[];
  /** Última vez que a pessoa abriu o sininho (null = nunca). */
  seenAt: string | null;
}

const KINDS = ["criada", "responsaveis", "status", "comentario", "link", "editada", "cobranca"];
const WINDOW_DAYS = 30;

/** Avisos da pessoa logada (leitura com o cliente do usuário → RLS). */
export async function getNotices(): Promise<NoticesPayload> {
  const me = await getSessionUser();
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();

  const [state, events, team] = await Promise.all([
    supabase.from("notification_state").select("seen_at").eq("profile_id", me.id).maybeSingle(),
    supabase
      .from("task_events")
      .select("id, task_id, actor_id, kind, details, created_at")
      .gte("created_at", since)
      .neq("actor_id", me.id)
      .in("kind", KINDS)
      .order("created_at", { ascending: false })
      .limit(300),
    // gravações em que outra pessoa me colocou na equipe
    supabase
      .from("recording_team")
      .select("recording_id, added_by, added_at, recordings(title, status)")
      .eq("profile_id", me.id)
      .neq("added_by", me.id)
      .gte("added_at", since)
      .order("added_at", { ascending: false })
      .limit(30),
  ]);
  if (events.error) return { notices: [], seenAt: null };
  const seenAt = (state.data?.seen_at as string | undefined) ?? null;

  const additions: TeamAddition[] = (team.error ? [] : (team.data ?? [])).flatMap((r) => {
    const rec = (Array.isArray(r.recordings) ? r.recordings[0] : r.recordings) as { title: string; status: string } | null;
    return rec
      ? [{ recordingId: r.recording_id as string, title: rec.title, status: rec.status, addedBy: (r.added_by as string | null) ?? null, addedAt: r.added_at as string }]
      : [];
  });

  const raw: RawEvent[] = (events.data ?? []).map((r) => ({
    id: r.id as number,
    taskId: r.task_id as string,
    actorId: (r.actor_id as string | null) ?? null,
    kind: r.kind as string,
    details: (r.details as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at as string,
  }));
  const taskIds = [...new Set(raw.map((e) => e.taskId))];
  const [tasks, assignees] = taskIds.length
    ? await Promise.all([
        supabase.from("tasks").select("id, title, created_by").in("id", taskIds),
        supabase.from("task_assignees").select("task_id, profile_id").in("task_id", taskIds),
      ])
    : [{ data: [] }, { data: [] }];
  const refs: TaskRef[] = (tasks.data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    createdBy: t.created_by as string,
    assigneeIds: (assignees.data ?? []).filter((a) => a.task_id === t.id).map((a) => a.profile_id as string),
  }));

  const notices = mergeNotices(buildNotices(raw, refs, me.id), buildRecordingNotices(additions, me.id));
  const actorIds = [...new Set(notices.map((n) => n.actorId))];
  const people = actorIds.length
    ? ((await supabase.from("profiles").select("id, full_name, avatar_url").in("id", actorIds)).data ?? [])
    : [];
  const byId = new Map(people.map((p) => [p.id as string, p]));

  return {
    seenAt,
    notices: notices.map((n) => {
      const p = byId.get(n.actorId);
      return {
        ...n,
        actorName: (p?.full_name as string | undefined) || "Alguém da equipe",
        actorAvatar: p ? avatarSrc(n.actorId, p.avatar_url as string | null) : null,
      };
    }),
  };
}

/** Marca tudo como visto agora (função do banco, só para quem chama). */
export async function markNoticesSeen(): Promise<{ ok: boolean; seenAt?: string }> {
  await getSessionUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notifications_mark_seen");
  if (error) return { ok: false };
  return { ok: true, seenAt: data as string };
}
