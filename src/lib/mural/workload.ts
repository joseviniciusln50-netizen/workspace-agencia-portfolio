import { isOpen, type TaskStatus } from "./model";

/*
 * Carga de trabalho por pessoa (lista da Equipe) — regras puras, testadas no Vitest.
 * "Aberta" = qualquer etapa antes de Entregue (mesma regra do mural). "Atrasada" = aberta e ainda
 * não aprovada, com prazo antes de hoje. "Hoje" é o dia em Brasília: o servidor roda em UTC.
 */

export interface Workload {
  open: number;
  overdue: number;
}

export const EMPTY_WORKLOAD: Workload = { open: 0, overdue: 0 };

/** Dia de hoje (yyyy-mm-dd) num fuso — por padrão o da agência. */
export function todayIn(timeZone = "America/Sao_Paulo", now: Date = new Date()): string {
  // en-CA formata como yyyy-mm-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function workloadByPerson(
  tasks: { id: string; status: TaskStatus; due: string | null }[],
  assignees: { task_id: string; profile_id: string }[],
  today: string,
): Map<string, Workload> {
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const out = new Map<string, Workload>();
  for (const a of assignees) {
    const t = byTask.get(a.task_id);
    if (!t || !isOpen(t)) continue;
    const w = out.get(a.profile_id) ?? { ...EMPTY_WORKLOAD };
    w.open++;
    if (t.due && t.due < today && t.status !== "aprovado") w.overdue++;
    out.set(a.profile_id, w);
  }
  return out;
}
