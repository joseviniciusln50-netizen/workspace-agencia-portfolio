/*
 * Lembrete diário (prazos e gravações da equipe) — regras puras (testadas no Vitest).
 * SEM imports com "@/": este arquivo também é empacotado na função agendada da Netlify
 * (netlify/functions/lembrete-prazos.mts), fora do Next.
 */

export interface DueRow {
  profile_id: string;
  task_title: string;
  /** yyyy-mm-dd */
  due: string;
}

/** Gravação agendada em que a pessoa está na equipe (data entre hoje e o fim da janela). */
export interface RecordingRow {
  profile_id: string;
  title: string;
  /** yyyy-mm-dd */
  date: string;
  /** "hh:mm" ou "hh:mm:ss" (como vem do banco) ou null */
  start: string | null;
}

/** Linha devolvida pela função do banco agenda_claim: prazo de tarefa ou gravação. */
export interface AgendaRow {
  profile_id: string;
  kind: "tarefa" | "gravacao";
  title: string;
  /** yyyy-mm-dd */
  day: string;
  start_time: string | null;
}

/** Separa as linhas do banco nos dois tipos que buildReminders usa. */
export function splitAgenda(rows: AgendaRow[]): { tasks: DueRow[]; recordings: RecordingRow[] } {
  const tasks: DueRow[] = [];
  const recordings: RecordingRow[] = [];
  for (const r of rows) {
    if (r.kind === "gravacao") recordings.push({ profile_id: r.profile_id, title: r.title, date: r.day, start: r.start_time });
    else tasks.push({ profile_id: r.profile_id, task_title: r.title, due: r.day });
  }
  return { tasks, recordings };
}

export interface ReminderMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const DAY = 86_400_000;
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo … 6 = sábado) de uma data yyyy-mm-dd. */
export const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Até quando olhar: amanhã; na sexta, até segunda (o fim de semana não tem lembrete). */
export function reminderUntil(today: string): string {
  return addDays(today, weekday(today) === 5 ? 3 : 1);
}

const WEEKDAY_NAME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function when(due: string, today: string): string {
  if (due < today) return "atrasada";
  if (due === today) return "hoje";
  if (due === addDays(today, 1)) return "amanhã";
  return WEEKDAY_NAME[weekday(due)]!;
}

function taskLine(list: DueRow[], today: string): string {
  const sorted = [...list].sort((a, b) => a.due.localeCompare(b.due) || a.task_title.localeCompare(b.task_title, "pt-BR"));
  const first = sorted[0]!;
  if (sorted.length === 1) {
    const w = when(first.due, today);
    return w === "atrasada" ? `Atrasada: ${first.task_title}` : `Vence ${w}: ${first.task_title}`;
  }
  const overdue = sorted.filter((r) => r.due < today).length;
  const todayN = sorted.filter((r) => r.due === today).length;
  const later = sorted.length - overdue - todayN;
  const parts = [
    overdue && `${overdue} ${overdue === 1 ? "atrasada" : "atrasadas"}`,
    todayN && `${todayN} para hoje`,
    later && `${later} para ${weekday(today) === 5 ? "os próximos dias" : "amanhã"}`,
  ].filter(Boolean);
  return `${sorted.length} tarefas no prazo: ${parts.join(", ")}. Comece por: ${first.task_title}`;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function recordingLine(list: RecordingRow[], today: string): string {
  // por dia e horário; sem horário vai para o fim do dia
  const sorted = [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (hhmm(a.start) ?? "99").localeCompare(hhmm(b.start) ?? "99") ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
  const first = sorted[0]!;
  const at = `${when(first.date, today)}${first.start ? ` às ${hhmm(first.start)}` : ""}`;
  if (sorted.length === 1) return `Gravação ${at}: ${first.title}`;
  return `${sorted.length} gravações. A primeira: ${at}, ${first.title}`;
}

/**
 * Uma mensagem por pessoa: gravações (em que ela está na equipe) primeiro, depois os prazos,
 * cada parte com o item mais urgente primeiro. Sem gravação, a mensagem é a mesma de antes.
 */
export function buildReminders(rows: DueRow[], today: string, recordings: RecordingRow[] = []): Map<string, ReminderMessage> {
  const tasksBy = new Map<string, DueRow[]>();
  for (const r of rows) tasksBy.set(r.profile_id, [...(tasksBy.get(r.profile_id) ?? []), r]);
  const recsBy = new Map<string, RecordingRow[]>();
  for (const r of recordings) recsBy.set(r.profile_id, [...(recsBy.get(r.profile_id) ?? []), r]);

  const out = new Map<string, ReminderMessage>();
  for (const person of new Set([...recsBy.keys(), ...tasksBy.keys()])) {
    const tasks = tasksBy.get(person);
    const recs = recsBy.get(person);
    if (!recs) {
      out.set(person, { title: "Prazos de hoje", body: taskLine(tasks!, today), url: "/tarefas?view=calendario", tag: "lembrete-prazos" });
      continue;
    }
    out.set(person, {
      title: "Agenda de hoje",
      body: tasks ? `${recordingLine(recs, today)}\n${taskLine(tasks, today)}` : recordingLine(recs, today),
      // só gravações: abre a aba; com prazos junto: o calendário mostra os dois
      url: tasks ? "/tarefas?view=calendario" : "/gravacoes",
      tag: "lembrete-prazos",
    });
  }
  return out;
}

/** Dia de hoje (yyyy-mm-dd) em Brasília — a função roda em UTC. */
export function todayInBrasilia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
