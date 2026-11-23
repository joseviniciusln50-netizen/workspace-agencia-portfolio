import { STATUS_LABEL, type TaskStatus } from "./model";

/*
 * Avisos (sininho) — regras puras, testadas no Vitest.
 * Derivados do histórico das tarefas: o que OUTRA pessoa fez numa tarefa que é minha
 * (sou responsável ou criei) ou que me atribuiu/retirou. E, das gravações, quando OUTRA pessoa
 * me coloca na equipe (recording_team.added_by/added_at). Ações próprias nunca viram aviso.
 */

export interface RawEvent {
  id: number;
  taskId: string;
  actorId: string | null;
  kind: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskRef {
  id: string;
  title: string;
  createdBy: string;
  assigneeIds: string[];
}

export interface Notice {
  /** Único entre tarefas e gravações (chave da lista). */
  key: string;
  /** Para onde o aviso leva. */
  href: string;
  /** Título da tarefa ou da gravação. */
  title: string;
  actorId: string;
  /** Frase depois do nome de quem fez: "atribuiu a você", "comentou em"… */
  text: string;
  /** Frase opcional de quem fez (cobrança), mostrada depois do título. */
  note?: string;
  createdAt: string;
}

export const NOTICE_LIMIT = 30;
export const NUDGE_NOTICE_TEXT = "cobrou a entrega de";
/** Sem registro de "visto" (primeiro uso): só os últimos 7 dias contam como novos. */
export const FIRST_USE_WINDOW_DAYS = 7;

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function buildNotices(events: RawEvent[], tasks: TaskRef[], meId: string): Notice[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: Notice[] = [];
  for (const e of [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)) {
    if (!e.actorId || e.actorId === meId) continue;
    const t = byId.get(e.taskId);
    if (!t) continue;
    const mine = t.assigneeIds.includes(meId) || t.createdBy === meId;
    let text: string | null = null;
    switch (e.kind) {
      case "criada":
        if (ids(e.details?.responsaveis).includes(meId)) text = "atribuiu a você";
        break;
      case "responsaveis": {
        const before = ids(e.details?.antes).includes(meId);
        const after = ids(e.details?.depois).includes(meId);
        if (after && !before) text = "atribuiu a você";
        else if (before && !after) text = "retirou você de";
        break;
      }
      case "status": {
        const to = e.details?.para as TaskStatus | undefined;
        if (mine && to && to in STATUS_LABEL) text = `moveu para “${STATUS_LABEL[to]}”`;
        break;
      }
      case "comentario":
        if (mine) text = "comentou em";
        break;
      case "link":
        if (mine) text = "adicionou um link em";
        break;
      case "cobranca":
        // só os responsáveis (quem criou e não faz a tarefa não é cobrado)
        if (t.assigneeIds.includes(meId)) text = NUDGE_NOTICE_TEXT;
        break;
      case "editada":
        if (mine && e.details && e.details.prazo_antes !== e.details.prazo_depois) text = "mudou o prazo de";
        break;
      // checklist: muito frequente, não vira aviso
    }
    if (text) {
      const note = e.kind === "cobranca" && typeof e.details?.mensagem === "string" ? e.details.mensagem.trim() : "";
      out.push({
        key: `t-${e.id}`,
        href: `/tarefas?tarefa=${t.id}`,
        title: t.title,
        actorId: e.actorId,
        text,
        ...(note ? { note } : {}),
        createdAt: e.createdAt,
      });
    }
    if (out.length >= NOTICE_LIMIT) break;
  }
  return out;
}

/** Linha de recording_team (com a gravação) em que EU estou na equipe. */
export interface TeamAddition {
  recordingId: string;
  title: string;
  status: string;
  addedBy: string | null;
  addedAt: string;
}

export const RECORDING_NOTICE_TEXT = "colocou você na gravação";

/** "Fulano colocou você na gravação X" — só quando quem colocou foi outra pessoa; canceladas não. */
export function buildRecordingNotices(rows: TeamAddition[], meId: string): Notice[] {
  return rows
    .filter((r) => r.addedBy && r.addedBy !== meId && r.status !== "cancelada")
    .map((r) => ({
      key: `g-${r.recordingId}`,
      href: `/gravacoes?g=${r.recordingId}`,
      title: r.title,
      actorId: r.addedBy!,
      text: RECORDING_NOTICE_TEXT,
      createdAt: r.addedAt,
    }));
}

/** Junta avisos de origens diferentes: mais novo primeiro, no máximo NOTICE_LIMIT. */
export function mergeNotices(...lists: Notice[][]): Notice[] {
  return lists
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.key.localeCompare(b.key))
    .slice(0, NOTICE_LIMIT);
}

/** Quantos avisos são novos desde a última vez que a pessoa abriu o sininho. */
export function unreadCount(notices: Pick<Notice, "createdAt">[], seenAt: string | null, now: Date = new Date()): number {
  const since = seenAt ?? new Date(now.getTime() - FIRST_USE_WINDOW_DAYS * 864e5).toISOString();
  const s = Date.parse(since);
  return notices.filter((n) => Date.parse(n.createdAt) > s).length;
}

export const isUnread = (n: Pick<Notice, "createdAt">, seenAt: string | null, now: Date = new Date()) => unreadCount([n], seenAt, now) === 1;

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", ou a data. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
