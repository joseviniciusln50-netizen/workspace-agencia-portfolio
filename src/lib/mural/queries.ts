import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import { avatarSrc } from "@/lib/profile/rules";
import { createClient } from "@/lib/supabase/server";
import type { Briefing, ChecklistItem, Client, MuralData, Note, NoteColor, Person, Priority, Project, ProjectStatus, Recording, RecordingStatus, Task, TaskStatus } from "./model";

/**
 * Carrega o mural (com a sessão do usuário → RLS: só membros ativos leem).
 * Uma consulta por tabela, montadas aqui (equipe pequena: volume baixo).
 */
export async function loadMural(): Promise<MuralData> {
  await getSessionUser();
  const supabase = await createClient();

  const [tasks, assignees, items, notes, briefings, participants, people, comments, links, clients, projects, recordings, team] = await Promise.all([
    supabase.from("tasks").select("id, title, client, brief, status, priority, due, briefing_id, client_id, project_id, created_by, created_at, updated_at").order("created_at", { ascending: false }),
    supabase.from("task_assignees").select("task_id, profile_id"),
    supabase.from("checklist_items").select("id, task_id, label, done, position").order("position", { ascending: true }),
    supabase.from("notes").select("id, text, color, author_id, created_at").order("created_at", { ascending: false }),
    supabase.from("briefings").select("id, title, client, client_id, meeting_date, notes, decisions, created_by, created_at").order("meeting_date", { ascending: false }),
    supabase.from("briefing_participants").select("briefing_id, profile_id"),
    supabase.from("profiles").select("id, full_name, avatar_url, is_active").order("full_name", { ascending: true }),
    supabase.from("task_comments").select("task_id"),
    supabase.from("task_links").select("task_id"),
    supabase.from("clients").select("id, name, notes, is_active").order("name", { ascending: true }),
    supabase.from("projects").select("id, client_id, name, description, status, due").order("name", { ascending: true }),
    supabase.from("recordings").select("id, title, client_id, client, project_id, scheduled_date, start_time, end_time, location, notes, status, created_by, created_at").order("scheduled_date", { ascending: true }),
    supabase.from("recording_team").select("recording_id, profile_id"),
  ]);

  const firstError = [tasks, assignees, items, notes, briefings, participants, people, comments, links, clients, projects, recordings, team].find((r) => r.error)?.error;
  if (firstError) throw new Error(`Falha ao carregar o mural: ${firstError.message}`);

  const assigneesBy = groupBy(assignees.data ?? [], (r) => r.task_id as string, (r) => r.profile_id as string);
  const checklistBy = groupBy(items.data ?? [], (r) => r.task_id as string, (r): ChecklistItem => ({
    id: r.id as string,
    label: r.label as string,
    done: r.done as boolean,
    position: r.position as number,
  }));
  const participantsBy = groupBy(participants.data ?? [], (r) => r.briefing_id as string, (r) => r.profile_id as string);
  const teamBy = groupBy(team.data ?? [], (r) => r.recording_id as string, (r) => r.profile_id as string);
  const hhmm = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 5) : null); // "14:00:00" → "14:00"
  const commentCount = countBy(comments.data ?? []);
  const linkCount = countBy(links.data ?? []);

  return {
    tasks: (tasks.data ?? []).map(
      (t): Task => ({
        id: t.id as string,
        title: t.title as string,
        client: t.client as string,
        brief: t.brief as string,
        status: t.status as TaskStatus,
        priority: t.priority as Priority,
        due: (t.due as string | null) ?? null,
        clientId: (t.client_id as string | null) ?? null,
        projectId: (t.project_id as string | null) ?? null,
        briefingId: (t.briefing_id as string | null) ?? null,
        createdBy: t.created_by as string,
        createdAt: t.created_at as string,
        updatedAt: t.updated_at as string,
        assigneeIds: assigneesBy.get(t.id as string) ?? [],
        checklist: checklistBy.get(t.id as string) ?? [],
        commentCount: commentCount.get(t.id as string) ?? 0,
        linkCount: linkCount.get(t.id as string) ?? 0,
      }),
    ),
    notes: (notes.data ?? []).map(
      (n): Note => ({
        id: n.id as string,
        text: n.text as string,
        color: n.color as NoteColor,
        authorId: n.author_id as string,
        createdAt: n.created_at as string,
      }),
    ),
    briefings: (briefings.data ?? []).map(
      (b): Briefing => ({
        id: b.id as string,
        title: b.title as string,
        client: b.client as string,
        meetingDate: b.meeting_date as string,
        notes: b.notes as string,
        decisions: b.decisions as string,
        clientId: (b.client_id as string | null) ?? null,
        createdBy: b.created_by as string,
        createdAt: b.created_at as string,
        participantIds: participantsBy.get(b.id as string) ?? [],
      }),
    ),
    recordings: (recordings.data ?? []).map(
      (r): Recording => ({
        id: r.id as string,
        title: r.title as string,
        date: r.scheduled_date as string,
        start: hhmm(r.start_time),
        end: hhmm(r.end_time),
        location: r.location as string,
        notes: r.notes as string,
        status: r.status as RecordingStatus,
        clientId: (r.client_id as string | null) ?? null,
        client: (r.client as string) ?? "",
        projectId: (r.project_id as string | null) ?? null,
        createdBy: r.created_by as string,
        createdAt: r.created_at as string,
        teamIds: teamBy.get(r.id as string) ?? [],
      }),
    ),
    people: (people.data ?? []).map(
      (p): Person => ({
        id: p.id as string,
        name: (p.full_name as string) || "Sem nome",
        avatar: avatarSrc(p.id as string, p.avatar_url as string | null),
        active: p.is_active as boolean,
      }),
    ),
    clients: (clients.data ?? []).map(
      (c): Client => ({ id: c.id as string, name: c.name as string, notes: c.notes as string, active: c.is_active as boolean }),
    ),
    projects: (projects.data ?? []).map(
      (p): Project => ({
        id: p.id as string,
        clientId: p.client_id as string,
        name: p.name as string,
        description: p.description as string,
        status: p.status as ProjectStatus,
        due: (p.due as string | null) ?? null,
      }),
    ),
  };
}

function countBy(rows: { task_id: unknown }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.task_id as string, (map.get(r.task_id as string) ?? 0) + 1);
  return map;
}

function groupBy<T, V>(rows: T[], key: (r: T) => string, value: (r: T) => V): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(value(r));
    else map.set(k, [value(r)]);
  }
  return map;
}
