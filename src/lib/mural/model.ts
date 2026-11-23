import type { AccessLevel } from "@/lib/auth/access";

/*
 * Modelo do MURAL (tarefas, checklists, post-its, briefings) — puro, testado no Vitest.
 * As permissões aqui ESPELHAM as funções do banco (migration 20261116120000_mural_real);
 * servem para a interface mostrar só o que a pessoa pode fazer. Quem decide é o banco.
 */

export type TaskStatus = "a_fazer" | "em_producao" | "em_revisao" | "ajustes" | "aprovado" | "entregue";
export type Priority = "baixa" | "media" | "alta";
export type NoteColor = "paper" | "mist" | "red" | "ink";

export const STATUS_ORDER: TaskStatus[] = ["a_fazer", "em_producao", "em_revisao", "ajustes", "aprovado", "entregue"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  a_fazer: "A fazer",
  em_producao: "Em produção",
  em_revisao: "Em revisão",
  ajustes: "Ajustes solicitados",
  aprovado: "Aprovado",
  entregue: "Postado",
};

export const PRIORITY_ORDER: Priority[] = ["baixa", "media", "alta"];
export const PRIORITY_LABEL: Record<Priority, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: string;
  title: string;
  client: string;
  brief: string;
  status: TaskStatus;
  priority: Priority;
  /** yyyy-mm-dd ou null (sem prazo) */
  due: string | null;
  briefingId: string | null;
  /** Cliente/projeto cadastrados (null = interno ou cliente só em texto, de antes do cadastro). */
  clientId: string | null;
  projectId: string | null;
  createdBy: string;
  createdAt: string;
  /** Última mudança (status, dados). Numa tarefa entregue, na prática é a data da entrega. */
  updatedAt: string;
  assigneeIds: string[];
  checklist: ChecklistItem[];
  /** Contagens para o cartão (o conteúdo é carregado ao abrir a tarefa). */
  commentCount: number;
  linkCount: number;
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface TaskLink {
  id: string;
  url: string;
  title: string;
  addedBy: string;
  createdAt: string;
}

export interface Note {
  id: string;
  text: string;
  color: NoteColor;
  authorId: string;
  createdAt: string;
}

export interface Briefing {
  id: string;
  title: string;
  client: string;
  /** yyyy-mm-dd */
  meetingDate: string;
  notes: string;
  decisions: string;
  clientId: string | null;
  createdBy: string;
  createdAt: string;
  participantIds: string[];
}

/* ------------------------------------------------------------------ gravações */

export type RecordingStatus = "agendada" | "realizada" | "cancelada";
export const RECORDING_STATUS_LABEL: Record<RecordingStatus, string> = { agendada: "Agendada", realizada: "Realizada", cancelada: "Cancelada" };

export interface Recording {
  id: string;
  title: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM ou null */
  start: string | null;
  end: string | null;
  location: string;
  notes: string;
  status: RecordingStatus;
  clientId: string | null;
  /** Nome do cliente em texto (fica no histórico se o cliente for apagado). */
  client: string;
  projectId: string | null;
  createdBy: string;
  createdAt: string;
  teamIds: string[];
}

export type ProjectStatus = "ativo" | "pausado" | "concluido";
export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["ativo", "pausado", "concluido"];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { ativo: "Ativo", pausado: "Pausado", concluido: "Concluído" };

export interface Client {
  id: string;
  name: string;
  notes: string;
  active: boolean;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  /** yyyy-mm-dd ou null */
  due: string | null;
}

export interface Person {
  id: string;
  name: string;
  avatar: string | null;
  active: boolean;
}

export interface TaskEvent {
  id: number;
  actorId: string | null;
  kind: "criada" | "editada" | "status" | "responsaveis" | "checklist" | "comentario" | "link" | "cobranca";
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface MuralData {
  tasks: Task[];
  notes: Note[];
  briefings: Briefing[];
  recordings: Recording[];
  people: Person[];
  clients: Client[];
  projects: Project[];
}

/* ------------------------------------------------------------------ permissões */

export const isAdminLevel = (level: AccessLevel) => level === "principal" || level === "admin";
const LOCKED: TaskStatus[] = ["aprovado", "entregue"];

/**
 * Status para os quais a pessoa pode MOVER a tarefa (sem incluir o atual).
 * Administradores: qualquer tarefa. Colaborador: as tarefas em que é responsável, para qualquer etapa
 * (inclusive aprovar e entregar — pedido do usuário em 17/11/2026).
 */
export function allowedStatuses(level: AccessLevel, userId: string, task: Pick<Task, "status" | "assigneeIds">): TaskStatus[] {
  if (!isAdminLevel(level) && !task.assigneeIds.includes(userId)) return [];
  return STATUS_ORDER.filter((s) => s !== task.status);
}

/** Editar dados / excluir: administradores; colaborador só a tarefa que criou, antes da aprovação. */
export function canEditTask(level: AccessLevel, userId: string, task: Pick<Task, "status" | "createdBy">): boolean {
  if (isAdminLevel(level)) return true;
  return task.createdBy === userId && !LOCKED.includes(task.status);
}

export const canDeleteTask = canEditTask;

/** Responsáveis: qualquer membro ativo escolhe ao criar e troca em qualquer tarefa (pedido do usuário em 18/11/2026). */
export function canEditAssignees(level: AccessLevel): boolean {
  return isAdminLevel(level) || level === "colaborador";
}

export function canEditChecklist(level: AccessLevel, userId: string, task: Pick<Task, "assigneeIds">): boolean {
  return isAdminLevel(level) || task.assigneeIds.includes(userId);
}

export function canDeleteNote(level: AccessLevel, userId: string, note: Pick<Note, "authorId">): boolean {
  return isAdminLevel(level) || note.authorId === userId;
}

export function canEditBriefing(level: AccessLevel, userId: string, b: Pick<Briefing, "createdBy">): boolean {
  return isAdminLevel(level) || b.createdBy === userId;
}

/** Comentar: qualquer membro ativo. Editar: só o autor. Apagar: autor ou administração. */
export function canEditComment(userId: string, c: Pick<TaskComment, "authorId">): boolean {
  return c.authorId === userId;
}
export function canDeleteComment(level: AccessLevel, userId: string, c: Pick<TaskComment, "authorId">): boolean {
  return isAdminLevel(level) || c.authorId === userId;
}

/** Adicionar link: administração, responsáveis ou quem criou a tarefa. Remover: quem adicionou ou administração. */
export function canAddLink(level: AccessLevel, userId: string, task: Pick<Task, "assigneeIds" | "createdBy">): boolean {
  return isAdminLevel(level) || task.assigneeIds.includes(userId) || task.createdBy === userId;
}
export function canRemoveLink(level: AccessLevel, userId: string, l: Pick<TaskLink, "addedBy">): boolean {
  return isAdminLevel(level) || l.addedBy === userId;
}

/** Apagar cliente: a confirmação é o nome do cliente (sem diferenciar maiúsculas; espaços nas pontas ignorados). Mesma regra do banco. */
export function clientDeleteConfirmed(name: string, typed: string): boolean {
  return typed.trim().toLowerCase() === name.trim().toLowerCase() && name.trim().length > 0;
}

/** Clientes e projetos: cadastrados e editados só pela administração (todos veem). */
export const canManageClients = (level: AccessLevel) => isAdminLevel(level);

/** Apagar projeto (espelho de project_delete): administração, e só depois de CONCLUÍDO. */
export const canDeleteProject = (level: AccessLevel, project: Pick<Project, "status">) =>
  canManageClients(level) && project.status === "concluido";

/* ------------------------------------------------------------------ cobrança (espelho de task_nudge) */

export const NUDGE_MAX = 140;
export const NUDGE_COOLDOWN_HOURS = 3;

/** Atrasada: prazo antes de hoje e ainda não aprovada/postada. `today` em AAAA-MM-DD (Brasília). */
export const isOverdue = (t: Pick<Task, "due" | "status">, today: string) => Boolean(t.due && t.due < today && !isClosed(t));

/** Cobrar: qualquer membro, em tarefa atrasada que tenha outro responsável além de quem cobra. */
export function canNudgeTask(userId: string, task: Pick<Task, "due" | "status" | "assigneeIds">, today: string): boolean {
  return isOverdue(task, today) && task.assigneeIds.some((id) => id !== userId);
}

export function nudgeProblem(message: string): string | null {
  return message.trim().length > NUDGE_MAX ? `A frase pode ter até ${NUDGE_MAX} caracteres.` : null;
}

/** Ligar tarefa a cliente/projeto: mesma regra de editar a tarefa. */
export const canSetTaskContext = canEditTask;

/* ------------------------------------------------------------------ validação */

export function clientProblem(name: string, notes: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Informe o nome do cliente (pelo menos 2 caracteres).";
  if (n.length > 80) return "Nome do cliente com no máximo 80 caracteres.";
  if (notes.trim().length > 2000) return "Observações com no máximo 2.000 caracteres.";
  return null;
}

export function projectProblem(name: string, description: string, due: string | null): string | null {
  const n = name.trim();
  if (n.length < 2) return "Informe o nome do projeto (pelo menos 2 caracteres).";
  if (n.length > 120) return "Nome do projeto com no máximo 120 caracteres.";
  if (description.trim().length > 2000) return "Descrição com no máximo 2.000 caracteres.";
  if (!isValidDate(due)) return "Prazo inválido.";
  return null;
}

/** Nome do cliente para exibir: cadastro > texto antigo > "Interno". */
export function clientName(task: Pick<Task, "clientId" | "client">, clients: Pick<Client, "id" | "name">[]): string {
  if (task.clientId) return clients.find((c) => c.id === task.clientId)?.name ?? (task.client || "Interno");
  return task.client || "Interno";
}

export interface BoardFilter {
  /** "todos" | "interno" | id do cliente */
  client: string;
  /** "todos" | id do projeto */
  project: string;
  /** "todos" | "minhas" | id da pessoa */
  person: string;
  /** Busca por texto (título, cliente, descrição); vazio = sem busca. */
  q?: string;
}

export const NO_FILTER: BoardFilter = { client: "todos", project: "todos", person: "todos", q: "" };

/** Texto comparável: sem acentos, minúsculo, espaços normalizados ("Vídeo" ≈ "video"). */
export function searchKey(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Todas as palavras da busca precisam aparecer em algum dos campos (em qualquer ordem). */
export function matchesSearch(fields: (string | null | undefined)[], q: string | undefined): boolean {
  const words = searchKey(q ?? "").split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = searchKey(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

export function matchesFilter(
  task: Pick<Task, "clientId" | "projectId" | "assigneeIds"> & Partial<Pick<Task, "title" | "client" | "brief">>,
  f: BoardFilter,
  meId: string,
): boolean {
  if (!matchesSearch([task.title, task.client, task.brief], f.q)) return false;
  if (f.client === "interno" && task.clientId) return false;
  if (f.client !== "todos" && f.client !== "interno" && task.clientId !== f.client) return false;
  if (f.project !== "todos" && task.projectId !== f.project) return false;
  if (f.person === "minhas" && !task.assigneeIds.includes(meId)) return false;
  if (f.person !== "todos" && f.person !== "minhas" && !task.assigneeIds.includes(f.person)) return false;
  return true;
}

export const COMMENT_MAX = 2000;
export function commentProblem(body: string): string | null {
  const t = body.trim();
  if (!t) return "Escreva o comentário.";
  if (t.length > COMMENT_MAX) return `No máximo ${COMMENT_MAX} caracteres.`;
  return null;
}

/**
 * Normaliza um link colado: aceita "drive.google.com/…" (completa com https://).
 * Devolve null se não for http(s) válido — bloqueia javascript:, data:, file: etc.
 */
export function normalizeUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v || v.length > 2000 || /\s/.test(v)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".") || u.username || u.password) return null;
  return u.toString();
}

export function linkProblem(rawUrl: string, title: string): string | null {
  if (!normalizeUrl(rawUrl)) return "Cole um link válido (começando com https://).";
  if (title.trim().length > 120) return "Nome do link com no máximo 120 caracteres.";
  return null;
}

/** Nome amigável do serviço, para o ícone/legenda do link. */
export function linkLabel(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
  const known: [RegExp, string][] = [
    [/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/, "Google Drive"],
    [/(^|\.)figma\.com$/, "Figma"],
    [/(^|\.)canva\.com$/, "Canva"],
    [/(^|\.)wetransfer\.com$|(^|\.)we\.tl$/, "WeTransfer"],
    [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
    [/(^|\.)vimeo\.com$/, "Vimeo"],
    [/(^|\.)frame\.io$/, "Frame.io"],
    [/(^|\.)dropbox\.com$/, "Dropbox"],
    [/(^|\.)notion\.so$|(^|\.)notion\.site$/, "Notion"],
    [/(^|\.)instagram\.com$/, "Instagram"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(v: string | null | undefined): boolean {
  if (!v) return true;
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export interface TaskInput {
  title: string;
  client: string;
  brief: string;
  priority: Priority;
  due: string | null;
}

export function taskInputProblem(i: TaskInput): string | null {
  const title = i.title.trim();
  if (title.length < 2) return "Dê um título à tarefa (pelo menos 2 caracteres).";
  if (title.length > 140) return "Título com no máximo 140 caracteres.";
  if (i.client.trim().length > 80) return "Cliente com no máximo 80 caracteres.";
  if (i.brief.trim().length > 5000) return "Briefing com no máximo 5.000 caracteres.";
  if (!PRIORITY_ORDER.includes(i.priority)) return "Prioridade inválida.";
  if (!isValidDate(i.due)) return "Prazo inválido.";
  return null;
}

export function checklistLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((l) => l.slice(0, 200));
}

export interface BriefingInput {
  title: string;
  client: string;
  meetingDate: string;
  notes: string;
  decisions: string;
}

export function briefingInputProblem(i: BriefingInput): string | null {
  const title = i.title.trim();
  if (title.length < 2) return "Dê um título ao briefing (pelo menos 2 caracteres).";
  if (title.length > 140) return "Título com no máximo 140 caracteres.";
  if (i.client.trim().length > 80) return "Cliente com no máximo 80 caracteres.";
  if (!i.meetingDate || !isValidDate(i.meetingDate)) return "Data da reunião inválida.";
  if (i.notes.trim().length > 10000) return "Anotações com no máximo 10.000 caracteres.";
  if (i.decisions.trim().length > 5000) return "Decisões com no máximo 5.000 caracteres.";
  return null;
}

export interface RecordingInput {
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  notes: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mesmas regras de private.check_recording (banco). Horários opcionais; término depois do início. */
export function recordingInputProblem(i: RecordingInput): string | null {
  const title = i.title.trim();
  if (title.length < 2) return "Dê um título à gravação (pelo menos 2 caracteres).";
  if (title.length > 140) return "Título com no máximo 140 caracteres.";
  if (!i.date || !isValidDate(i.date)) return "Informe uma data válida.";
  if (i.start && !TIME_RE.test(i.start)) return "Horário de início inválido.";
  if (i.end && !TIME_RE.test(i.end)) return "Horário de término inválido.";
  if (i.end && !i.start) return "Informe o horário de início (o término sozinho não vale).";
  if (i.start && i.end && i.end <= i.start) return "O término precisa ser depois do início.";
  if (i.location.trim().length > 160) return "Local com no máximo 160 caracteres.";
  if (i.notes.trim().length > 3000) return "Observações com no máximo 3.000 caracteres.";
  return null;
}

/** Editar/excluir: quem agendou ou a administração. */
export function canEditRecording(level: AccessLevel, userId: string, r: Pick<Recording, "createdBy">): boolean {
  return isAdminLevel(level) || r.createdBy === userId;
}

/** Mudar o status (realizada/cancelada): quem agendou, a equipe da gravação ou a administração. */
export function canSetRecordingStatus(level: AccessLevel, userId: string, r: Pick<Recording, "createdBy" | "teamIds">): boolean {
  return canEditRecording(level, userId, r) || r.teamIds.includes(userId);
}

/** Ordem da aba: próximas (mais cedo primeiro, por data e horário) e depois o histórico (mais recente primeiro). */
export function splitRecordings<T extends Pick<Recording, "date" | "start" | "status">>(list: T[], today: string) {
  const key = (r: T) => `${r.date} ${r.start ?? "99:99"}`;
  const upcoming = list.filter((r) => r.status === "agendada" && r.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
  const past = list.filter((r) => !(r.status === "agendada" && r.date >= today)).sort((a, b) => key(b).localeCompare(key(a)));
  return { upcoming, past };
}

/** "14:00–16:30", "a partir das 14:00" ou "Horário a definir". */
export function recordingTime(r: Pick<Recording, "start" | "end">): string {
  if (r.start && r.end) return `${r.start}–${r.end}`;
  if (r.start) return `a partir das ${r.start}`;
  return "Horário a definir";
}

export const NOTE_MAX = 280;
export function noteProblem(text: string, color: string): string | null {
  const t = text.trim();
  if (!t) return "Escreva o recado.";
  if (t.length > NOTE_MAX) return `No máximo ${NOTE_MAX} caracteres.`;
  if (!["paper", "mist", "red", "ink"].includes(color)) return "Cor inválida.";
  return null;
}

/* ------------------------------------------------------------------ utilidades */

export function progress(items: ChecklistItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export const isOpen = (t: Pick<Task, "status">) => t.status !== "entregue";

/** Dias que uma tarefa entregue continua visível no quadro (depois sai, mas fica no histórico). */
export const DELIVERED_VISIBLE_DAYS = 7;

/**
 * Entregues "recentes": mudaram há no máximo DELIVERED_VISIBLE_DAYS dias. As mais antigas saem do quadro
 * para não poluir o mural (continuam no cliente, no perfil e no calendário).
 */
export function splitDelivered<T extends Pick<Task, "status" | "updatedAt">>(tasks: T[], now: Date, days = DELIVERED_VISIBLE_DAYS) {
  const limit = now.getTime() - days * 864e5;
  const recent: T[] = [];
  const old: T[] = [];
  for (const t of tasks) {
    if (t.status !== "entregue") continue;
    (Date.parse(t.updatedAt) >= limit ? recent : old).push(t);
  }
  return { recent, old };
}
export const isClosed = (t: Pick<Task, "status">) => t.status === "aprovado" || t.status === "entregue";

/** Compara prazos (null = sem prazo, vai para o fim). */
export function byDue(a: Pick<Task, "due">, b: Pick<Task, "due">): number {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due.localeCompare(b.due);
}
