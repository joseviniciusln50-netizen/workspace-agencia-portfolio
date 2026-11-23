"use server";

import { refresh } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { UUID_RE } from "@/lib/profile/rules";
import { notifyRecordingTeam, notifyTaskAction } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";
import {
  briefingInputProblem,
  checklistLines,
  clientProblem,
  commentProblem,
  PROJECT_STATUS_ORDER,
  projectProblem,
  recordingInputProblem,
  type ProjectStatus,
  type RecordingInput,
  type RecordingStatus,
  linkProblem,
  normalizeUrl,
  noteProblem,
  nudgeProblem,
  PRIORITY_ORDER,
  STATUS_ORDER,
  taskInputProblem,
  type BriefingInput,
  type Priority,
  type TaskComment,
  type TaskEvent,
  type TaskLink,
  type TaskInput,
  type TaskStatus,
} from "./model";

/*
 * Ações do mural. Cada uma: (1) reconfere a sessão; (2) valida os dados; (3) chama a FUNÇÃO DO BANCO
 * com a sessão do usuário — é o banco que decide quem pode o quê; (4) refresh() atualiza a tela.
 */

export interface MuralResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const uuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const uuids = (v: unknown): string[] => (Array.isArray(v) ? v.filter(uuid).slice(0, 30) : []);

function dbError(message: string | undefined, fallback: string): string {
  if (message && /[À-ú]|tarefa|permiss|respons|administra|briefing|post-it|checklist|colaborador|grava/i.test(message)) return message;
  return fallback;
}

function normTask(i: TaskInput): TaskInput {
  return {
    title: String(i.title ?? "").trim(),
    client: String(i.client ?? "").trim(),
    brief: String(i.brief ?? "").trim(),
    priority: (PRIORITY_ORDER.includes(i.priority) ? i.priority : "media") as Priority,
    due: i.due ? String(i.due) : null,
  };
}

/* ------------------------------------------------------------------ tarefas */

/** Cliente/projeto da tarefa (null + null = "Interno"). O banco confere permissão e coerência. */
interface TaskContext {
  clientId?: string | null;
  projectId?: string | null;
}

async function setContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  ctx: TaskContext,
): Promise<string | null> {
  const { error } = await supabase.rpc("task_set_context", {
    p_task: taskId,
    p_client: uuid(ctx.clientId) ? ctx.clientId : null,
    p_project: uuid(ctx.projectId) ? ctx.projectId : null,
  });
  return error ? dbError(error.message, "Tarefa salva, mas não foi possível ligar ao cliente/projeto.") : null;
}

export async function createTask(
  input: TaskInput & TaskContext & { assigneeIds: string[]; checklist: string; briefingId?: string | null },
): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  const t = normTask(input);
  const problem = taskInputProblem(t);
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_create", {
    p_title: t.title,
    p_client: "", // o nome vem do cadastro (task_set_context)
    p_brief: t.brief,
    p_priority: t.priority,
    p_due: t.due,
    p_assignees: uuids(input.assigneeIds),
    p_checklist: checklistLines(String(input.checklist ?? "")),
    p_briefing: uuid(input.briefingId) ? input.briefingId : null,
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível criar a tarefa.") };
  const id = data as string;
  const ctxError = input.clientId || input.projectId ? await setContext(supabase, id, input) : null;
  await notifyTaskAction(supabase, me, id, started); // avisa no celular quem deve saber
  refresh();
  return ctxError ? { ok: false, error: ctxError, id } : { ok: true, id };
}

export async function updateTask(taskId: string, input: TaskInput & TaskContext): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  if (!uuid(taskId)) return { ok: false, error: "Tarefa inválida." };
  const t = normTask(input);
  const problem = taskInputProblem(t);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_update", {
    p_task: taskId,
    p_title: t.title,
    p_client: t.client,
    p_brief: t.brief,
    p_priority: t.priority,
    p_due: t.due,
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível salvar a tarefa.") };
  const ctxError = await setContext(supabase, taskId, input);
  await notifyTaskAction(supabase, me, taskId, started); // avisa no celular quem deve saber
  refresh();
  return ctxError ? { ok: false, error: ctxError } : { ok: true };
}

/* ------------------------------------------------------------------ clientes e projetos */

export async function createClientRecord(name: string, notes: string): Promise<MuralResult> {
  await getSessionUser();
  const problem = clientProblem(String(name ?? ""), String(notes ?? ""));
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_create", { p_name: String(name).trim(), p_notes: String(notes ?? "").trim() });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível cadastrar o cliente.") };
  refresh();
  return { ok: true, id: data as string };
}

export async function updateClientRecord(clientId: string, name: string, notes: string, active: boolean): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(clientId)) return { ok: false, error: "Cliente inválido." };
  const problem = clientProblem(String(name ?? ""), String(notes ?? ""));
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("client_update", {
    p_client: clientId,
    p_name: String(name).trim(),
    p_notes: String(notes ?? "").trim(),
    p_active: Boolean(active),
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível salvar o cliente.") };
  refresh();
  return { ok: true };
}

/**
 * Apaga um cliente (só administração; o banco confere e exige o nome como confirmação).
 * Somem o cliente e os projetos; tarefas, briefings e gravações ficam no histórico com o nome em texto.
 */
export async function deleteClientRecord(clientId: string, confirmName: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(clientId)) return { ok: false, error: "Cliente inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("client_delete", { p_client: clientId, p_confirm: String(confirmName ?? "").trim() });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível apagar o cliente.") };
  refresh();
  return { ok: true };
}

/** Apaga um projeto CONCLUÍDO (só administração; o banco confere). Tarefas e gravações ficam sem projeto. */
export async function deleteProject(projectId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(projectId)) return { ok: false, error: "Projeto inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("project_delete", { p_project: projectId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível apagar o projeto.") };
  refresh();
  return { ok: true };
}

export async function createProject(clientId: string, name: string, description: string, due: string | null): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(clientId)) return { ok: false, error: "Cliente inválido." };
  const problem = projectProblem(String(name ?? ""), String(description ?? ""), due || null);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_create", {
    p_client: clientId,
    p_name: String(name).trim(),
    p_description: String(description ?? "").trim(),
    p_due: due || null,
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível criar o projeto.") };
  refresh();
  return { ok: true, id: data as string };
}

export async function updateProject(
  projectId: string,
  name: string,
  description: string,
  status: ProjectStatus,
  due: string | null,
): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(projectId) || !PROJECT_STATUS_ORDER.includes(status)) return { ok: false, error: "Projeto inválido." };
  const problem = projectProblem(String(name ?? ""), String(description ?? ""), due || null);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("project_update", {
    p_project: projectId,
    p_name: String(name).trim(),
    p_description: String(description ?? "").trim(),
    p_status: status,
    p_due: due || null,
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível salvar o projeto.") };
  refresh();
  return { ok: true };
}

export async function setTaskAssignees(taskId: string, assigneeIds: string[]): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  if (!uuid(taskId)) return { ok: false, error: "Tarefa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_set_assignees", { p_task: taskId, p_assignees: uuids(assigneeIds) });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível alterar os responsáveis.") };
  await notifyTaskAction(supabase, me, taskId, started); // avisa no celular quem deve saber
  refresh();
  return { ok: true };
}

/** Cobrar tarefa atrasada: avisa os responsáveis (sininho + celular) e fica no histórico. Regras no banco (task_nudge). */
export async function nudgeTask(taskId: string, message: string): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  if (!uuid(taskId)) return { ok: false, error: "Tarefa inválida." };
  const msg = String(message ?? "").trim();
  const problem = nudgeProblem(msg);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_nudge", { p_task: taskId, p_message: msg });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível cobrar a tarefa.") };
  await notifyTaskAction(supabase, me, taskId, started); // avisa no celular os responsáveis
  refresh();
  return { ok: true };
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  if (!uuid(taskId) || !STATUS_ORDER.includes(status)) return { ok: false, error: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_set_status", { p_task: taskId, p_status: status });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível mudar o status.") };
  await notifyTaskAction(supabase, me, taskId, started); // avisa no celular quem deve saber
  refresh();
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(taskId)) return { ok: false, error: "Tarefa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_delete", { p_task: taskId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível excluir a tarefa.") };
  refresh();
  return { ok: true };
}

export async function getTaskEvents(taskId: string): Promise<TaskEvent[]> {
  await getSessionUser();
  if (!uuid(taskId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_events")
    .select("id, actor_id, kind, details, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((e) => ({
    id: e.id as number,
    actorId: (e.actor_id as string | null) ?? null,
    kind: e.kind as TaskEvent["kind"],
    details: (e.details as Record<string, unknown> | null) ?? null,
    createdAt: e.created_at as string,
  }));
}

/* ------------------------------------------------------------------ comentários e links */

export async function getTaskThread(taskId: string): Promise<{ comments: TaskComment[]; links: TaskLink[] }> {
  await getSessionUser();
  if (!uuid(taskId)) return { comments: [], links: [] };
  const supabase = await createClient();
  const [c, l] = await Promise.all([
    supabase.from("task_comments").select("id, author_id, body, created_at, edited_at").eq("task_id", taskId).order("created_at", { ascending: true }).limit(200),
    supabase.from("task_links").select("id, url, title, added_by, created_at").eq("task_id", taskId).order("created_at", { ascending: true }),
  ]);
  return {
    comments: (c.data ?? []).map((r) => ({
      id: r.id as string,
      authorId: r.author_id as string,
      body: r.body as string,
      createdAt: r.created_at as string,
      editedAt: (r.edited_at as string | null) ?? null,
    })),
    links: (l.data ?? []).map((r) => ({
      id: r.id as string,
      url: r.url as string,
      title: r.title as string,
      addedBy: r.added_by as string,
      createdAt: r.created_at as string,
    })),
  };
}

export async function addComment(taskId: string, body: string): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  const b = String(body ?? "").trim();
  const problem = commentProblem(b);
  if (!uuid(taskId) || problem) return { ok: false, error: problem ?? "Tarefa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("comment_add", { p_task: taskId, p_body: b });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível comentar.") };
  await notifyTaskAction(supabase, me, taskId, started); // avisa no celular quem deve saber
  refresh();
  return { ok: true };
}

export async function editComment(commentId: string, body: string): Promise<MuralResult> {
  await getSessionUser();
  const b = String(body ?? "").trim();
  const problem = commentProblem(b);
  if (!uuid(commentId) || problem) return { ok: false, error: problem ?? "Comentário inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("comment_edit", { p_comment: commentId, p_body: b });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível editar.") };
  refresh();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(commentId)) return { ok: false, error: "Comentário inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("comment_delete", { p_comment: commentId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível apagar.") };
  refresh();
  return { ok: true };
}

export async function addLink(taskId: string, rawUrl: string, title: string): Promise<MuralResult> {
  const me = await getSessionUser();
  const started = Date.now();
  const problem = linkProblem(String(rawUrl ?? ""), String(title ?? ""));
  const url = normalizeUrl(String(rawUrl ?? ""));
  if (!uuid(taskId) || problem || !url) return { ok: false, error: problem ?? "Tarefa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_add", { p_task: taskId, p_url: url, p_title: String(title ?? "").trim() });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível adicionar o link.") };
  await notifyTaskAction(supabase, me, taskId, started); // avisa no celular quem deve saber
  refresh();
  return { ok: true };
}

export async function removeLink(linkId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(linkId)) return { ok: false, error: "Link inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_remove", { p_link: linkId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível remover o link.") };
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ checklist */

export async function addChecklistItem(taskId: string, label: string): Promise<MuralResult> {
  await getSessionUser();
  const l = String(label ?? "").trim();
  if (!uuid(taskId) || !l) return { ok: false, error: "Escreva o item." };
  if (l.length > 200) return { ok: false, error: "Item com no máximo 200 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("checklist_add", { p_task: taskId, p_label: l });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível adicionar o item.") };
  refresh();
  return { ok: true };
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(itemId) || typeof done !== "boolean") return { ok: false, error: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("checklist_toggle", { p_item: itemId, p_done: done });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível marcar o item.") };
  refresh();
  return { ok: true };
}

export async function removeChecklistItem(itemId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(itemId)) return { ok: false, error: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("checklist_remove", { p_item: itemId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível remover o item.") };
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ post-its */

export async function createNote(text: string, color: string): Promise<MuralResult> {
  await getSessionUser();
  const t = String(text ?? "").trim();
  const problem = noteProblem(t, String(color));
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("note_create", { p_text: t, p_color: color });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível fixar o post-it.") };
  refresh();
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(noteId)) return { ok: false, error: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("note_delete", { p_note: noteId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível remover o post-it.") };
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ briefings */

function normBriefing(i: BriefingInput): BriefingInput {
  return {
    title: String(i.title ?? "").trim(),
    client: String(i.client ?? "").trim(),
    meetingDate: String(i.meetingDate ?? ""),
    notes: String(i.notes ?? "").trim(),
    decisions: String(i.decisions ?? "").trim(),
  };
}

async function setBriefingClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  briefingId: string,
  clientId: string | null | undefined,
): Promise<string | null> {
  const { error } = await supabase.rpc("briefing_set_client", { p_briefing: briefingId, p_client: uuid(clientId) ? clientId : null });
  return error ? dbError(error.message, "Briefing salvo, mas não foi possível ligar ao cliente.") : null;
}

export async function createBriefing(
  input: BriefingInput & { participantIds: string[]; clientId?: string | null },
): Promise<MuralResult> {
  await getSessionUser();
  const b = normBriefing(input);
  const problem = briefingInputProblem(b);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("briefing_create", {
    p_title: b.title,
    p_client: "", // o nome vem do cadastro (briefing_set_client)
    p_date: b.meetingDate,
    p_notes: b.notes,
    p_decisions: b.decisions,
    p_participants: uuids(input.participantIds),
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível registrar o briefing.") };
  const id = data as string;
  const ctxError = input.clientId ? await setBriefingClient(supabase, id, input.clientId) : null;
  refresh();
  return ctxError ? { ok: false, error: ctxError, id } : { ok: true, id };
}

export async function updateBriefing(
  briefingId: string,
  input: BriefingInput & { participantIds: string[]; clientId?: string | null },
): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(briefingId)) return { ok: false, error: "Briefing inválido." };
  const b = normBriefing(input);
  const problem = briefingInputProblem(b);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("briefing_update", {
    p_briefing: briefingId,
    p_title: b.title,
    p_client: b.client,
    p_date: b.meetingDate,
    p_notes: b.notes,
    p_decisions: b.decisions,
    p_participants: uuids(input.participantIds),
  });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível salvar o briefing.") };
  const ctxError = await setBriefingClient(supabase, briefingId, input.clientId);
  refresh();
  return ctxError ? { ok: false, error: ctxError } : { ok: true };
}

export async function deleteBriefing(briefingId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(briefingId)) return { ok: false, error: "Briefing inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("briefing_delete", { p_briefing: briefingId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível excluir o briefing.") };
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ gravações */

export interface RecordingPayload extends RecordingInput {
  clientId: string | null;
  projectId: string | null;
  teamIds: string[];
}

function recordingArgs(i: RecordingPayload) {
  return {
    p_title: i.title.trim(),
    p_date: i.date,
    p_start: i.start || null,
    p_end: i.end || null,
    p_location: i.location.trim(),
    p_notes: i.notes.trim(),
    p_client: uuid(i.clientId) ? i.clientId : null,
    p_project: uuid(i.projectId) ? i.projectId : null,
    p_team: uuids(i.teamIds),
  };
}

/** Agenda uma gravação (qualquer membro ativo). As regras valem no banco (recording_create). */
export async function createRecording(input: RecordingPayload): Promise<MuralResult> {
  const me = await getSessionUser();
  const problem = recordingInputProblem(input);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recording_create", recordingArgs(input));
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível agendar a gravação.") };
  await notifyRecordingTeam(supabase, me, data as string, []); // avisa no celular quem foi colocado na equipe
  refresh();
  return { ok: true, id: data as string };
}

export async function updateRecording(recordingId: string, input: RecordingPayload): Promise<MuralResult> {
  const me = await getSessionUser();
  if (!uuid(recordingId)) return { ok: false, error: "Gravação inválida." };
  const problem = recordingInputProblem(input);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const before = ((await supabase.from("recording_team").select("profile_id").eq("recording_id", recordingId)).data ?? []).map((t) => t.profile_id as string);
  const { error } = await supabase.rpc("recording_update", { p_recording: recordingId, ...recordingArgs(input) });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível salvar a gravação.") };
  await notifyRecordingTeam(supabase, me, recordingId, before); // só quem ENTROU na equipe
  refresh();
  return { ok: true };
}

export async function setRecordingStatus(recordingId: string, status: RecordingStatus): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(recordingId)) return { ok: false, error: "Gravação inválida." };
  if (!["agendada", "realizada", "cancelada"].includes(status)) return { ok: false, error: "Status inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("recording_set_status", { p_recording: recordingId, p_status: status });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível mudar o status.") };
  refresh();
  return { ok: true };
}

export async function deleteRecording(recordingId: string): Promise<MuralResult> {
  await getSessionUser();
  if (!uuid(recordingId)) return { ok: false, error: "Gravação inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("recording_delete", { p_recording: recordingId });
  if (error) return { ok: false, error: dbError(error.message, "Não foi possível excluir a gravação.") };
  refresh();
  return { ok: true };
}
