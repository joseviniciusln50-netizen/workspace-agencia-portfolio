import { isClosed, matchesFilter, matchesSearch, type BoardFilter, type Briefing, type Project, type Recording, type Task } from "./model";

/*
 * Calendário do mural — regras puras (testadas no Vitest).
 * Junta, por dia: prazos de tarefas, reuniões de briefing, gravações agendadas e prazos de projetos.
 * Datas sempre como texto ISO (yyyy-mm-dd), sem fuso: comparar texto = comparar dias.
 */

export type CalendarKind = "tarefa" | "briefing" | "gravacao" | "projeto";

export interface CalendarEntry {
  kind: CalendarKind;
  id: string;
  title: string;
  /** Cliente (ou "Interno"). */
  context: string;
  /** Tarefa aprovada/entregue ou projeto concluído. */
  done: boolean;
  /** Para projetos: o cliente (a página de destino). */
  clientId?: string | null;
  /** Para gravações: o horário de início (HH:MM). */
  time?: string | null;
}

export const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
/** Semana começando na segunda (padrão brasileiro de agenda de trabalho). */
export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Mês anterior/seguinte. `m` é 0–11. */
export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const t = y * 12 + m + delta;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

/** 6 semanas (42 dias) cobrindo o mês, começando na segunda-feira. */
export function monthGrid(y: number, m: number): { date: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(y, m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // segunda = 0
  const out: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(y, m, 1 - offset + i));
    out.push({ date: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: d.getUTCMonth() === m });
  }
  return out;
}

const KIND_ORDER: Record<CalendarKind, number> = { gravacao: 0, briefing: 1, projeto: 2, tarefa: 3 };

/**
 * Itens por dia, respeitando os filtros do quadro:
 * - tarefas: o mesmo `matchesFilter` do quadro;
 * - briefings: cliente e pessoa (participante ou quem registrou); somem ao filtrar por projeto;
 * - gravações: cliente, projeto, pessoa (equipe ou quem agendou) e busca; canceladas não aparecem;
 * - projetos: só cliente/projeto; somem ao filtrar por pessoa.
 */
export function calendarEntries(
  data: { tasks: Task[]; briefings: Briefing[]; projects: Project[]; clients: { id: string; name: string }[]; recordings?: Recording[] },
  f: BoardFilter,
  meId: string,
): Map<string, CalendarEntry[]> {
  const clientName = new Map(data.clients.map((c) => [c.id, c.name]));
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (day: string, e: CalendarEntry) => {
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  };

  const clientOk = (clientId: string | null) =>
    f.client === "todos" || (f.client === "interno" ? !clientId : clientId === f.client);
  const personId = f.person === "minhas" ? meId : f.person;

  for (const t of data.tasks) {
    if (!t.due || !matchesFilter(t, f, meId)) continue;
    add(t.due, { kind: "tarefa", id: t.id, title: t.title, context: t.client || "Interno", done: isClosed(t) });
  }

  if (f.project === "todos") {
    for (const b of data.briefings) {
      if (!clientOk(b.clientId) || !matchesSearch([b.title, b.client], f.q)) continue;
      if (personId !== "todos" && b.createdBy !== personId && !b.participantIds.includes(personId)) continue;
      add(b.meetingDate, { kind: "briefing", id: b.id, title: b.title, context: b.client || "Interno", done: false });
    }
  }

  for (const r of data.recordings ?? []) {
    if (r.status === "cancelada" || !clientOk(r.clientId)) continue;
    if (f.project !== "todos" && r.projectId !== f.project) continue;
    if (personId !== "todos" && r.createdBy !== personId && !r.teamIds.includes(personId)) continue;
    const client = (r.clientId ? clientName.get(r.clientId) : undefined) ?? (r.client || undefined);
    if (!matchesSearch([r.title, r.location, client], f.q)) continue;
    add(r.date, { kind: "gravacao", id: r.id, title: r.title, context: client ?? "Interno", done: r.status === "realizada", time: r.start });
  }

  if (f.person === "todos" && f.client !== "interno") {
    for (const p of data.projects) {
      if (!p.due || !clientOk(p.clientId) || !matchesSearch([p.name, clientName.get(p.clientId)], f.q)) continue;
      if (f.project !== "todos" && p.id !== f.project) continue;
      add(p.due, {
        kind: "projeto",
        id: p.id,
        title: p.name,
        context: clientName.get(p.clientId) ?? "Cliente",
        done: p.status === "concluido",
        clientId: p.clientId,
      });
    }
  }

  for (const list of byDay.values())
    list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title, "pt-BR"));
  return byDay;
}
