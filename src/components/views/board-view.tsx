"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Plus } from "lucide-react";
import { useCallback, useState, useTransition, type FormEvent } from "react";
import { BoardFilters } from "@/components/mural/board-filters";
import { CalendarBoard } from "@/components/mural/calendar-board";
import { useMural } from "@/components/mural/mural-context";
import { NOTE_COLORS, NOTE_STYLE, PostIt } from "@/components/notes/post-it";
import { useSessionUser } from "@/components/shell/session-context";
import { Checklist } from "@/components/tasks/checklist";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { Accent, Card, Dot, Light, PageHeader, ProgressBar, StatusPill } from "@/components/ui/primitives";
import { createNote, deleteNote } from "@/lib/mural/actions";
import {
  byDue,
  canDeleteNote,
  canEditChecklist,
  matchesFilter,
  NO_FILTER,
  NOTE_MAX,
  progress,
  STATUS_LABEL,
  STATUS_ORDER,
  splitDelivered,
  DELIVERED_VISIBLE_DAYS,
  type BoardFilter,
  type NoteColor,
  type Task,
} from "@/lib/mural/model";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

export type BoardTab = "quadro" | "calendario" | "postits" | "checklists";

const TABS: { value: BoardTab; label: string }[] = [
  { value: "quadro", label: "Quadro" },
  { value: "calendario", label: "Calendário" },
  { value: "postits", label: "Post-its" },
  { value: "checklists", label: "Checklists" },
];

export function BoardView({ initialTab = "quadro", initialOpenId = null }: { initialTab?: BoardTab; initialOpenId?: string | null }) {
  const [tab, setTab] = useState<BoardTab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER);
  const me = useSessionUser();
  const { tasks } = useMural();
  const filtered = tasks.filter((t) => matchesFilter(t, filter, me.id));
  const close = useCallback(() => setOpenId(null), []);

  return (
    <>
      <PageHeader
        eyebrow="Gestão da agência"
        title={
          <>
            <Light>Mural de</Light> <Accent>tarefas</Accent>
            <Dot />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="glass-ink flex rounded-full p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className="relative rounded-full px-3 py-2 text-xs font-bold md:px-4"
              >
                {tab === t.value && (
                  <motion.span
                    layoutId="board-tab"
                    className="absolute inset-0 rounded-full bg-brand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className={cn("relative transition-colors", tab === t.value ? "text-paper" : "text-paper/65 hover:text-paper")}>{t.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={buttonClass("primary")}
          >
            <Plus className="size-4" /> Nova tarefa
          </button>
        </div>
      </PageHeader>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab !== "postits" && tasks.length > 0 && (
            <BoardFilters value={filter} onChange={setFilter} shown={filtered.length} total={tasks.length} />
          )}
          {tab === "quadro" && <Kanban tasks={filtered} total={tasks.length} onOpen={setOpenId} onCreate={() => setCreating(true)} />}
          {tab === "calendario" && <CalendarBoard filter={filter} onOpenTask={setOpenId} />}
          {tab === "postits" && <NotesWall />}
          {tab === "checklists" && <ChecklistsList tasks={filtered} onOpen={setOpenId} />}
        </motion.div>
      </AnimatePresence>

      <TaskSheet taskId={openId} onClose={close} />
      <TaskForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function Kanban({ tasks, total, onOpen, onCreate }: { tasks: Task[]; total: number; onOpen: (id: string) => void; onCreate: () => void }) {
  if (total > 0 && tasks.length === 0) {
    return <p className="py-12 text-center text-sm font-light text-muted">Nenhuma tarefa com esses filtros.</p>;
  }
  if (tasks.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ink/15 px-6 py-14 text-center">
        <p className="text-lg">
          <span className="font-light">O mural está</span> <strong className="font-extrabold">vazio</strong>
          <span className="text-brand">.</span>
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-light text-muted">Crie a primeira tarefa da equipe — com responsáveis, prazo e checklist.</p>
        <button
          type="button"
          onClick={onCreate}
          className={buttonClass("dark", "md", "mt-5 px-5")}
        >
          <Plus className="size-4" /> Criar primeira tarefa
        </button>
      </div>
    );
  }

  return <KanbanColumns tasks={tasks} onOpen={onOpen} />;
}

/** Colunas do quadro. "Postado" mostra só as postagens recentes; as antigas ficam atrás de um botão. */
function KanbanColumns({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const [showOld, setShowOld] = useState(false);
  const delivered = splitDelivered(tasks, new Date());
  return (
    <LayoutGroup>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 2xl:grid-cols-6">
        {STATUS_ORDER.map((status) => {
          const isDelivered = status === "entregue";
          const col = (isDelivered ? (showOld ? [...delivered.recent, ...delivered.old] : delivered.recent) : tasks.filter((t) => t.status === status)).sort(byDue);
          return (
            <section
              key={status}
              className="w-[82%] shrink-0 snap-start rounded-card border border-hairline bg-mist/40 p-2.5 md:w-auto"
              aria-label={STATUS_LABEL[status]}
            >
              <header className="mb-2.5 flex items-center justify-between border-b border-hairline px-1.5 pt-1 pb-3">
                <StatusPill status={status} />
                <span className="text-xl leading-none font-light text-muted tabular-nums">{String(col.length).padStart(2, "0")}</span>
              </header>
              <div className="flex min-h-24 flex-col gap-2.5">
                {col.map((t) => (
                  <TaskCard key={t.id} task={t} onOpen={onOpen} />
                ))}
                {col.length === 0 && (
                  <p className="rounded-tile border border-dashed border-ink/15 py-8 text-center text-xs font-light text-muted">
                    {isDelivered && delivered.old.length > 0 ? `Nada postado nos últimos ${DELIVERED_VISIBLE_DAYS} dias` : "Sem tarefas"}
                  </p>
                )}
                {isDelivered && delivered.old.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOld((v) => !v)}
                    className="rounded-tile px-2 py-2 text-left text-[11px] font-bold tracking-wide text-muted uppercase hover:bg-mist hover:text-ink"
                  >
                    {showOld ? "Ocultar postadas antigas" : `+ ${delivered.old.length} postadas há mais de ${DELIVERED_VISIBLE_DAYS} dias`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function NotesWall() {
  const me = useSessionUser();
  const { notes } = useMural();
  const [text, setText] = useState("");
  const [color, setColor] = useState<NoteColor>("paper");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setError(null);
    start(async () => {
      const r = await createNote(value, color);
      if (r.ok) setText("");
      else setError(r.error ?? "Não foi possível fixar.");
    });
  }

  function remove(id: string) {
    start(async () => {
      const r = await deleteNote(id);
      if (!r.ok) setError(r.error ?? "Não foi possível remover.");
    });
  }

  return (
    <>
      <form onSubmit={submit} className="mb-3 flex flex-col gap-3 rounded-card border border-hairline bg-paper p-3 md:flex-row md:items-center">
        <label htmlFor="new-note" className="sr-only">
          Novo post-it
        </label>
        <input
          id="new-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={NOTE_MAX}
          placeholder="Escreva um recado para a equipe…"
          className="min-w-0 flex-1 rounded-tile bg-mist-soft px-4 py-3 text-base font-medium outline-none placeholder:font-light placeholder:text-muted focus:ring-2 focus:ring-ink md:text-sm"
        />
        <div className="flex items-center gap-2">
          <fieldset className="flex gap-1.5" aria-label="Cor do post-it">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.label}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
                className={cn(
                  "size-9 rounded-full ring-1 ring-ink/10 transition-transform",
                  NOTE_STYLE[c.value],
                  color === c.value && "scale-110 ring-2 ring-ink ring-offset-2",
                )}
              />
            ))}
          </fieldset>
          <button
            type="submit"
            disabled={!text.trim() || pending}
            className="ml-auto flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-bold text-paper transition-opacity disabled:opacity-40"
          >
            <Plus className="size-4" /> Fixar
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm font-semibold text-brand-text">
          {error}
        </p>
      )}

      <div className="mt-6 columns-2 gap-4 space-y-4 md:columns-3 xl:columns-4">
        <AnimatePresence initial={false}>
          {notes.map((n) => (
            <PostIt key={n.id} note={n} onRemove={canDeleteNote(me.accessLevel, me.id, n) ? remove : undefined} />
          ))}
        </AnimatePresence>
      </div>
      {notes.length === 0 && <p className="py-12 text-center text-sm font-light text-muted">Nenhum post-it ainda. Fixe o primeiro recado.</p>}
    </>
  );
}

function ChecklistsList({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const me = useSessionUser();
  const active = tasks.filter((t) => t.checklist.length > 0 && t.status !== "entregue").sort(byDue);

  if (active.length === 0) {
    return <p className="py-12 text-center text-sm font-light text-muted">Nenhuma tarefa aberta com checklist.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {active.map((t) => {
        const pct = progress(t.checklist);
        return (
          <Card key={t.id}>
            <button type="button" onClick={() => onOpen(t.id)} className="flex w-full items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.16em] text-brand-text uppercase">{t.client || "Interno"}</p>
                <p className="mt-0.5 truncate text-[15px] font-semibold">{t.title}</p>
              </div>
              <span className="text-3xl leading-none font-light tabular-nums">
                {pct}
                <span className="text-base text-muted">%</span>
              </span>
            </button>
            <div className="mt-3">
              <ProgressBar value={pct} />
            </div>
            <Checklist task={t} editable={canEditChecklist(me.accessLevel, me.id, t)} className="-mx-2 mt-2" />
          </Card>
        );
      })}
    </div>
  );
}
