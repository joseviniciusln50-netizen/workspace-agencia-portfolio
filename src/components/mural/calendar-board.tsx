"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMural } from "@/components/mural/mural-context";
import { useSessionUser } from "@/components/shell/session-context";
import { calendarEntries, MONTHS, monthGrid, shiftMonth, WEEKDAYS, type CalendarEntry } from "@/lib/mural/calendar";
import type { BoardFilter } from "@/lib/mural/model";
import { cn, todayISO } from "@/lib/utils";

const KIND_LABEL = { tarefa: "Tarefa", briefing: "Briefing", gravacao: "Gravação", projeto: "Projeto" } as const;

/** Estilo do item por tipo: tarefa = papel, briefing = preto, gravação = vermelho claro, projeto = contorno vermelho. Atrasada = vermelho. */
function chipClass(e: CalendarEntry, overdue: boolean) {
  if (e.done) return "bg-mist text-muted line-through";
  if (overdue) return "bg-brand text-paper";
  if (e.kind === "briefing") return "bg-ink text-paper";
  if (e.kind === "gravacao") return "bg-brand/10 text-ink ring-1 ring-inset ring-brand/40";
  if (e.kind === "projeto") return "border border-brand/50 bg-paper text-ink";
  return "border border-hairline bg-paper text-ink";
}

/** Calendário mensal: prazos de tarefas, reuniões de briefing, gravações e prazos de projetos. */
export function CalendarBoard({ filter, onOpenTask }: { filter: BoardFilter; onOpenTask: (id: string) => void }) {
  const me = useSessionUser();
  const { tasks, briefings, projects, clients, recordings } = useMural();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => calendarEntries({ tasks, briefings, projects, clients, recordings }, filter, me.id), [tasks, briefings, projects, clients, recordings, filter, me.id]);
  const grid = monthGrid(cursor.y, cursor.m);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const monthCount = [...byDay.entries()].filter(([d]) => d.startsWith(monthPrefix)).reduce((n, [, l]) => n + l.length, 0);
  const dayItems = byDay.get(selected) ?? [];

  function go(delta: number) {
    const next = shiftMonth(cursor.y, cursor.m, delta);
    setCursor(next);
    setSelected(`${next.y}-${String(next.m + 1).padStart(2, "0")}-01`);
  }
  function goToday() {
    setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
    setSelected(today);
  }

  const selectedLabel = new Date(`${selected}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="rounded-card border border-hairline bg-paper p-3 md:p-4 lg:col-span-8" aria-label="Calendário">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl md:text-2xl" aria-live="polite">
            <span className="font-extrabold capitalize">{MONTHS[cursor.m]}</span> <span className="font-light text-muted">{cursor.y}</span>
            <span className="text-brand">.</span>
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={goToday} className="h-10 rounded-tile border border-hairline px-3 text-xs font-bold uppercase hover:border-ink">
              Hoje
            </button>
            <button type="button" onClick={() => go(-1)} aria-label="Mês anterior" className="grid size-10 place-items-center rounded-tile hover:bg-mist">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Próximo mês" className="grid size-10 place-items-center rounded-tile hover:bg-mist">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-7 border-b border-hairline pb-1.5 text-center text-[10px] font-bold tracking-[0.14em] text-muted uppercase">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div role="grid" className="mt-1 grid grid-cols-7 gap-px">
          {grid.map(({ date, inMonth }) => {
            const items = byDay.get(date) ?? [];
            const isToday = date === today;
            const isSel = date === selected;
            const label = `${Number(date.slice(8))} de ${MONTHS[Number(date.slice(5, 7)) - 1]}${items.length ? `, ${items.length} ${items.length === 1 ? "item" : "itens"}` : ""}`;
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={label}
                onClick={() => setSelected(date)}
                className={cn(
                  "flex min-h-14 flex-col items-stretch rounded-tile p-1 text-left transition-colors md:min-h-24 md:p-1.5",
                  isSel ? "bg-ink/[0.06] ring-1 ring-ink" : "hover:bg-mist/60",
                  !inMonth && "opacity-40",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center self-center rounded-full text-xs tabular-nums md:self-start",
                    isToday ? "bg-brand font-bold text-paper" : "font-medium",
                  )}
                >
                  {Number(date.slice(8))}
                </span>
                {/* celular: pontinhos; desktop: até 3 itens */}
                {items.length > 0 && (
                  <span className="mt-1 flex flex-wrap justify-center gap-0.5 md:hidden" aria-hidden>
                    {items.slice(0, 4).map((e) => (
                      <span key={e.kind + e.id} className={cn("size-1.5 rounded-full", e.kind === "briefing" ? "bg-ink" : e.done ? "bg-muted/50" : e.kind === "gravacao" ? "bg-paper ring-1 ring-brand" : "bg-brand")} />
                    ))}
                  </span>
                )}
                <span className="mt-1 hidden flex-col gap-0.5 md:flex" aria-hidden>
                  {items.slice(0, 3).map((e) => (
                    <span key={e.kind + e.id} className={cn("truncate rounded px-1.5 py-0.5 text-[10px] font-semibold", chipClass(e, overdue(e, date, today)))}>
                      {e.time ? `${e.time} ` : ""}
                      {e.title}
                    </span>
                  ))}
                  {items.length > 3 && <span className="px-1 text-[10px] font-bold text-muted">+{items.length - 3}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold tracking-[0.12em] text-muted uppercase">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-hairline bg-paper" /> Tarefa</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-ink" /> Briefing</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand/10 ring-1 ring-brand/40" /> Gravação</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-brand/50" /> Projeto</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand" /> Atrasada</span>
          <span className="ml-auto tabular-nums">{monthCount} no mês</span>
        </p>
      </section>

      <section className="lg:col-span-4" aria-label="Itens do dia">
        <p className="text-[10px] font-bold tracking-[0.18em] text-muted uppercase">Dia selecionado</p>
        <h3 className="mt-1 text-lg font-extrabold first-letter:uppercase">{selectedLabel}</h3>
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul
            key={selected}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 flex flex-col gap-2"
          >
            {dayItems.length === 0 && <li className="rounded-tile border border-dashed border-ink/15 py-8 text-center text-sm font-light text-muted">Nada marcado para este dia.</li>}
            {dayItems.map((e) => (
              <li key={e.kind + e.id}>
                <DayItem entry={e} overdue={overdue(e, selected, today)} onOpenTask={onOpenTask} />
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </section>
    </div>
  );
}

const overdue = (e: CalendarEntry, date: string, today: string) => (e.kind === "tarefa" || e.kind === "projeto") && !e.done && date < today;

function DayItem({ entry: e, overdue, onOpenTask }: { entry: CalendarEntry; overdue: boolean; onOpenTask: (id: string) => void }) {
  const body = (
    <>
      <span className={cn("mt-1 size-2.5 shrink-0 rounded-sm", e.kind === "briefing" ? "bg-ink" : e.kind === "gravacao" ? "bg-brand/10 ring-1 ring-brand/40" : overdue ? "bg-brand" : e.kind === "projeto" ? "border border-brand/60" : "border border-ink/30")} />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold tracking-[0.16em] text-muted uppercase">
          {KIND_LABEL[e.kind]}
          {e.time ? ` · ${e.time}` : ""} · <span className="text-brand-text">{e.context}</span>
          {overdue && <span className="text-brand-text"> · atrasada</span>}
        </span>
        <span className={cn("mt-0.5 block text-[15px] leading-snug font-semibold break-words", e.done && "text-muted line-through")}>{e.title}</span>
      </span>
    </>
  );
  const cls = "flex w-full items-start gap-3 rounded-tile border border-hairline bg-paper p-3 text-left transition-colors hover:border-ink/30";
  if (e.kind === "tarefa")
    return (
      <button type="button" onClick={() => onOpenTask(e.id)} className={cls}>
        {body}
      </button>
    );
  return (
    <Link href={e.kind === "briefing" ? `/briefings?b=${e.id}` : e.kind === "gravacao" ? `/gravacoes?g=${e.id}` : `/clientes/${e.clientId}`} className={cls}>
      {body}
    </Link>
  );
}
