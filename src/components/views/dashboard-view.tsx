"use client";

import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import { SloganPositive } from "@/components/brand/logo";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { useSessionUser } from "@/components/shell/session-context";
import { useMural } from "@/components/mural/mural-context";
import { DueLabel } from "@/components/tasks/due-label";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { buttonClass } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { Dot, Light, ProgressBar, SectionTitle, StatusPill } from "@/components/ui/primitives";
import { byDue as byDueDate, isAdminLevel, isClosed, progress, type Task } from "@/lib/mural/model";
import { cn, daysFromNow, todayISO } from "@/lib/utils";

/*
 * Início — só o que ajuda na rotina (dados REAIS do mural):
 *   1. saudação com o nome real;
 *   2. minhas tarefas (abertas, em que sou responsável);
 *   3. o que precisa de atenção (atrasadas, aguardando revisão, ajustes solicitados);
 *   4. prazos da semana.
 * Indicadores, equipe e post-its ficam nas próprias abas (sem duplicar o mural).
 */

function greeting(h: number) {
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const linkAction =
  "flex items-center gap-1 text-[11px] font-bold tracking-wide text-brand-text uppercase underline-offset-4 hover:underline";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function DashboardView() {
  const user = useSessionUser();
  const { tasks } = useMural();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const now = new Date();
  const today = todayISO();
  const weekEnd = daysFromNow(7);
  const byDue = byDueDate;
  const overdue = (t: Task) => !!t.due && t.due < today && !isClosed(t);
  const thisWeek = (t: Task) => !!t.due && t.due >= today && t.due <= weekEnd;

  const open = tasks.filter((t) => !isClosed(t));
  const mine = open.filter((t) => t.assigneeIds.includes(user.id)).sort(byDue);
  const mineIds = new Set(mine.map((t) => t.id));

  // Para a administração, "aguardando revisão" é pendência; para todos, atrasos e ajustes pedidos.
  const admin = isAdminLevel(user.accessLevel);
  const attention = open
    .filter((t) => !mineIds.has(t.id) && (overdue(t) || t.status === "ajustes" || (admin && t.status === "em_revisao")))
    .sort(byDue)
    .slice(0, 5);
  const attentionIds = new Set(attention.map((t) => t.id));

  const week = open
    .filter((t) => !mineIds.has(t.id) && !attentionIds.has(t.id) && thisWeek(t))
    .sort(byDue)
    .slice(0, 5);

  // Próxima entrega: a minha tarefa aberta de prazo mais próximo (atrasadas primeiro — já vêm ordenadas).
  const next = mine.find((t) => !!t.due) ?? mine[0] ?? null;
  const myOverdue = mine.filter(overdue).length;
  const myThisWeek = mine.filter(thisWeek).length;
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <>
      <Reveal>
        {/* 1. Saudação (capa clara com os TRAÇADOS oficiais) + a próxima entrega em destaque */}
        <RevealItem>
          <PageHero
            traces={1}
            eyebrow={now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            title={
              <>
                <Light>{greeting(now.getHours())},</Light>
                <br />
                <strong className="font-extrabold">{firstName}</strong>
                <Dot />
              </>
            }
            aside={next ? <NextUp task={next} onOpen={setOpenId} /> : <AllClear />}
          >
            <p className="max-w-md text-[15px] leading-relaxed font-light text-muted md:text-base">
              {mine.length === 0 ? (
                "Nenhuma tarefa aberta com você."
              ) : (
                <>
                  Você tem <strong className="font-bold text-ink">{plural(mine.length, "tarefa aberta", "tarefas abertas")}</strong>
                  {myOverdue > 0 && (
                    <>
                      {", "}
                      <strong className="font-bold text-brand-text">{plural(myOverdue, "atrasada", "atrasadas")}</strong>
                    </>
                  )}
                  {myThisWeek > 0 && <>{` e ${plural(myThisWeek, "vence", "vencem")} nesta semana`}</>}.
                </>
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setCreating(true)} className={buttonClass("primary")}>
                <Plus className="size-4" /> Nova tarefa
              </button>
              <Link href="/tarefas" className={buttonClass("outline")}>
                Abrir mural <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </PageHero>
        </RevealItem>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
          {/* 2. Minhas tarefas */}
          <RevealItem className="lg:col-span-7">
            <section aria-labelledby="minhas-tarefas">
              <SectionTitle
                action={
                  <Link href="/tarefas" className={linkAction}>
                    Mural <ArrowUpRight className="size-3.5" />
                  </Link>
                }
              >
                <span id="minhas-tarefas">Minhas tarefas</span>
              </SectionTitle>
              {mine.length <= 1 ? (
                <EmptyLine>{mine.length === 0 ? "Nenhuma tarefa aberta com você." : "Só a tarefa em destaque, lá em cima."}</EmptyLine>
              ) : (
                <ul className="divide-y divide-hairline border-y border-hairline">
                  {mine.filter((t) => t.id !== next?.id).slice(0, 6).map((t) => (
                    <TaskRow key={t.id} task={t} onOpen={setOpenId} showStatus />
                  ))}
                </ul>
              )}
            </section>
          </RevealItem>

          <div className="flex flex-col gap-12 lg:col-span-5">
            {/* 3. Precisa de atenção */}
            <RevealItem>
              <section aria-labelledby="atencao">
                <SectionTitle>
                  <span id="atencao">Precisa de atenção</span>
                </SectionTitle>
                {attention.length === 0 ? (
                  <EmptyLine>Nada atrasado ou pendente.</EmptyLine>
                ) : (
                  <ul className="divide-y divide-hairline border-y border-hairline">
                    {attention.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onOpen={setOpenId}
                        reason={overdue(t) ? "Atrasada" : t.status === "ajustes" ? "Ajustes solicitados" : "Aguardando revisão"}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </RevealItem>

            {/* 4. Prazos da semana */}
            <RevealItem>
              <section aria-labelledby="prazos">
                <SectionTitle>
                  <span id="prazos">Prazos da semana</span>
                </SectionTitle>
                {week.length === 0 ? (
                  <EmptyLine>Sem outras entregas nos próximos 7 dias.</EmptyLine>
                ) : (
                  <ul className="divide-y divide-hairline border-y border-hairline">
                    {week.map((t) => (
                      <TaskRow key={t.id} task={t} onOpen={setOpenId} compact />
                    ))}
                  </ul>
                )}
              </section>
            </RevealItem>
          </div>
        </div>
      </Reveal>

      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
      <TaskForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <p className="border-y border-hairline py-5 text-sm font-light text-muted">{children}</p>;
}

/** Data em bloco (dia grande + mês) — atrasada em vermelho. Sem prazo: travessão. */
function DueBlock({ iso, dark = false }: { iso: string | null; dark?: boolean }) {
  if (!iso) {
    return (
      <span className={cn("flex w-11 shrink-0 flex-col items-center text-[10px] font-bold tracking-[0.12em] uppercase", dark ? "text-paper/40" : "text-muted/70")}>
        <span className="text-xl leading-none font-light">—</span>
        <span className="mt-1">prazo</span>
      </span>
    );
  }
  const d = new Date(`${iso}T12:00:00`);
  const late = iso < todayISO();
  return (
    <span className={cn("flex w-11 shrink-0 flex-col items-center", late ? "text-brand-text" : dark ? "text-paper" : "text-ink", late && dark && "text-brand")}>
      <span className="text-2xl leading-none font-light tabular-nums">{String(d.getDate()).padStart(2, "0")}</span>
      <span className="mt-1 text-[10px] font-bold tracking-[0.12em] uppercase">{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
    </span>
  );
}

/** Destaque da capa: a minha tarefa aberta mais urgente (material "Ink surface"). Toque abre o detalhe. */
function NextUp({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const pct = task.checklist.length > 0 ? progress(task.checklist) : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="group relative block w-full overflow-hidden rounded-card bg-ink p-5 text-left text-paper transition-transform active:scale-[0.99]"
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -bottom-16 size-48 rounded-full bg-[radial-gradient(circle,rgb(255_0_0/0.35),transparent_65%)]" />
      <span className="relative flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[0.2em] text-paper/60 uppercase">Sua próxima entrega</span>
        <ArrowUpRight className="size-4 text-paper/40 transition-colors group-hover:text-brand" />
      </span>
      <span className="relative mt-4 flex items-start gap-4">
        <DueBlock iso={task.due} dark />
        <span className="min-w-0 flex-1">
          <span className="block text-lg leading-snug font-semibold break-words">{task.title}</span>
          <span className="mt-1 block truncate text-xs font-light text-paper/60">
            {task.client || "Interno"} · <DueLabel iso={task.due} className="text-paper/80" />
          </span>
        </span>
      </span>
      <span className="relative mt-4 flex items-center gap-3">
        <StatusPill status={task.status} />
        {pct !== null && (
          <span className="flex flex-1 items-center gap-2">
            <ProgressBar value={pct} dark />
            <span className="text-[11px] font-bold tabular-nums text-paper/70">{pct}%</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** Sem tarefas abertas: o slogan oficial (versão positiva, fundo claro). */
function AllClear() {
  return (
    <div className="flex items-center gap-4 md:justify-end">
      <SloganPositive className="h-16 md:h-20" />
    </div>
  );
}

/** Linha de tarefa: data em bloco, título e cliente; toque abre o detalhe. */
function TaskRow({
  task,
  onOpen,
  showStatus = false,
  compact = false,
  reason,
}: {
  task: Task;
  onOpen: (id: string) => void;
  showStatus?: boolean;
  compact?: boolean;
  reason?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-tile px-2 py-3 text-left transition-colors hover:bg-mist-soft"
      >
        <DueBlock iso={task.due} />
        <span className="min-w-0 flex-1 border-l border-hairline pl-4">
          <span className={compact ? "block truncate text-sm font-semibold" : "block truncate text-[15px] font-semibold"}>
            {task.title}
          </span>
          <span className="mt-0.5 block truncate text-xs font-light text-muted">
            {task.client || "Interno"}
            {reason && <span className="font-bold text-brand-text"> · {reason}</span>}
          </span>
        </span>
        {showStatus && (
          <span className="hidden shrink-0 sm:block">
            <StatusPill status={task.status} />
          </span>
        )}
        <ArrowUpRight className="size-4 shrink-0 text-ink/20 transition-colors group-hover:text-brand" />
      </button>
    </li>
  );
}
