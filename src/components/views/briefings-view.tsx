"use client";

import { CalendarDays, ListTodo, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { useMural } from "@/components/mural/mural-context";
import { ContextPicker } from "@/components/mural/context-picker";
import { PeoplePicker, PeopleStack } from "@/components/mural/people-picker";
import { useSessionUser } from "@/components/shell/session-context";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { Accent, Dot, Light, PageHeader, StatusPill } from "@/components/ui/primitives";
import { SearchField } from "@/components/ui/search-field";
import { fieldInput, fieldLabel, FormError, Sheet } from "@/components/ui/sheet";
import { createBriefing, deleteBriefing, updateBriefing } from "@/lib/mural/actions";
import { briefingInputProblem, canEditBriefing, matchesSearch, type Briefing } from "@/lib/mural/model";
import { cn, todayISO } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/** Briefings — registro de reuniões, anotações, decisões e demandas geradas (dados REAIS). */
export function BriefingsView({ initialOpenId = null }: { initialOpenId?: string | null }) {
  const { briefings, tasks, person } = useMural();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [q, setQ] = useState("");
  const shown = briefings.filter((b) => matchesSearch([b.title, b.client, b.notes, b.decisions], q));

  return (
    <>
      <PageHeader
        eyebrow="Reuniões e decisões"
        title={
          <>
            <Light>Registro de</Light> <Accent>briefings</Accent>
            <Dot />
          </>
        }
      >
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={buttonClass("primary")}
        >
          <Plus className="size-4" /> Novo briefing
        </button>
      </PageHeader>

      {briefings.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink/15 px-6 py-14 text-center">
          <p className="text-lg">
            <span className="font-light">Nenhum briefing</span> <strong className="font-extrabold">registrado</strong>
            <span className="text-brand">.</span>
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm font-light text-muted">
            Registre a reunião com o cliente — participantes, anotações e decisões — e transforme as decisões em tarefas no mural.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={buttonClass("dark", "md", "mt-5 px-5")}
          >
            <Plus className="size-4" /> Registrar primeiro briefing
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center">
            <SearchField
              id="b-q"
              label="Buscar briefings"
              value={q}
              onChange={setQ}
              placeholder="Buscar em títulos, anotações e decisões…"
              className="md:w-96"
            />
            {q.trim() && (
              <span className="text-xs text-muted tabular-nums">
                {shown.length} de {briefings.length}
              </span>
            )}
          </div>
          {shown.length === 0 && <p className="py-12 text-center text-sm font-light text-muted">Nenhum briefing com essa busca.</p>}
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {shown.map((b) => {
            const generated = tasks.filter((t) => t.briefingId === b.id).length;
            const participants = b.participantIds.map((id) => person(id)).filter((p) => p !== undefined);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(b.id)}
                  className="flex w-full flex-col gap-3 rounded-card border border-hairline bg-paper p-4 text-left transition-colors hover:border-ink/30 md:p-5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-bold tracking-[0.16em] text-brand-text uppercase">{b.client || "Interno"}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted">
                      <CalendarDays className="size-3.5" /> {fmtDate(b.meetingDate)}
                    </span>
                  </span>
                  <span className="text-[15px] leading-snug font-semibold break-words">{b.title}</span>
                  {b.decisions && <span className="line-clamp-2 text-sm font-light text-muted">{b.decisions}</span>}
                  <span className="flex items-center justify-between border-t border-hairline pt-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                      <ListTodo className="size-3.5" /> {generated} {generated === 1 ? "tarefa" : "tarefas"}
                    </span>
                    <PeopleStack people={participants} max={4} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </>
      )}

      <BriefingForm open={creating} onClose={() => setCreating(false)} />
      <BriefingSheet briefingId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ formulário */

function BriefingForm({ open, onClose, briefing }: { open: boolean; onClose: () => void; briefing?: Briefing }) {
  return (
    <Sheet open={open} onClose={onClose} title={briefing ? "Editar briefing" : "Novo briefing"} wide>
      {open && <BriefingFormBody key={briefing?.id ?? "novo"} briefing={briefing} onDone={onClose} />}
    </Sheet>
  );
}

function BriefingFormBody({ briefing, onDone }: { briefing?: Briefing; onDone: () => void }) {
  const me = useSessionUser();
  const { activePeople } = useMural();
  const [title, setTitle] = useState(briefing?.title ?? "");
  const [clientId, setClientId] = useState<string | null>(briefing?.clientId ?? null);
  const [meetingDate, setMeetingDate] = useState(briefing?.meetingDate ?? todayISO());
  const [participants, setParticipants] = useState<string[]>(briefing?.participantIds ?? [me.id]);
  const [notes, setNotes] = useState(briefing?.notes ?? "");
  const [decisions, setDecisions] = useState(briefing?.decisions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { title, client: "", meetingDate, notes, decisions };
    const problem = briefingInputProblem(input);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const r = briefing
        ? await updateBriefing(briefing.id, { ...input, participantIds: participants, clientId })
        : await createBriefing({ ...input, participantIds: participants, clientId });
      if (r.ok) onDone();
      else setError(r.error ?? "Não foi possível salvar.");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="b-title" className={fieldLabel}>
          Assunto da reunião
        </label>
        <input
          id="b-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          autoFocus
          placeholder="Ex.: Planejamento de dezembro"
          className={cn(fieldInput, "h-12")}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ContextPicker
          clientId={clientId}
          projectId={null}
          withProject={false}
          onChange={(c) => setClientId(c.clientId)}
          idPrefix="b"
        />
        <div>
          <label htmlFor="b-date" className={fieldLabel}>
            Data
          </label>
          <input id="b-date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className={cn(fieldInput, "h-12")} />
        </div>
      </div>
      <fieldset>
        <legend className={fieldLabel}>Participantes da equipe</legend>
        <PeoplePicker people={activePeople} value={participants} onChange={setParticipants} meId={me.id} />
      </fieldset>
      <div>
        <label htmlFor="b-notes" className={fieldLabel}>
          Anotações
        </label>
        <textarea
          id="b-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={10000}
          rows={5}
          placeholder="O que foi conversado: contexto, objetivos, referências, pedidos do cliente…"
          className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
        />
      </div>
      <div>
        <label htmlFor="b-decisions" className={fieldLabel}>
          Decisões
        </label>
        <textarea
          id="b-decisions"
          value={decisions}
          onChange={(e) => setDecisions(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder={"O que ficou combinado (uma decisão por linha)\nEx.: 3 reels por semana em dezembro"}
          className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
        />
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="h-12 flex-1 rounded-tile bg-brand px-6 text-sm font-bold tracking-wide text-paper uppercase hover:brightness-110 disabled:opacity-60 sm:flex-none"
        >
          {pending ? "Salvando…" : briefing ? "Salvar" : "Registrar briefing"}
        </button>
        <button type="button" onClick={onDone} className="h-12 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ detalhe */

function BriefingSheet({ briefingId, onClose }: { briefingId: string | null; onClose: () => void }) {
  const me = useSessionUser();
  const { briefings, tasks, person } = useMural();
  const b = briefings.find((x) => x.id === briefingId) ?? null;
  const [editing, setEditing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const busy = editing || creatingTask || !!openTask;
  const generated = b ? tasks.filter((t) => t.briefingId === b.id) : [];
  const can = b ? canEditBriefing(me.accessLevel, me.id, b) : false;

  return (
    <>
      <Sheet
        open={!!b && !busy}
        onClose={() => {
          setConfirmDelete(false);
          onClose();
        }}
        title={b?.title ?? ""}
        eyebrow={b ? `${b.client || "Interno"} · ${fmtDate(b.meetingDate)}` : ""}
        wide
      >
        {b && (
          <div className="flex flex-col gap-6">
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-muted uppercase">
                <Users className="size-3.5" /> Participantes
              </p>
              <p className="text-sm">
                {b.participantIds.map((id) => (id === me.id ? "Você" : person(id)?.name)).filter(Boolean).join(", ") || "—"}
              </p>
            </section>
            {b.notes && (
              <section>
                <p className="mb-2 text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Anotações</p>
                <p className="text-[15px] leading-relaxed font-light whitespace-pre-line md:text-sm">{b.notes}</p>
              </section>
            )}
            {b.decisions && (
              <section>
                <p className="mb-2 text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Decisões</p>
                <p className="border-l-2 border-brand pl-3 text-[15px] leading-relaxed whitespace-pre-line md:text-sm">{b.decisions}</p>
              </section>
            )}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Tarefas geradas</p>
                <button
                  type="button"
                  onClick={() => setCreatingTask(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-tile bg-ink px-3 text-[11px] font-bold text-paper uppercase"
                >
                  <Plus className="size-3.5" /> Criar tarefa
                </button>
              </div>
              {generated.length === 0 ? (
                <p className="text-sm font-light text-muted">Nenhuma ainda. Transforme as decisões em tarefas no mural.</p>
              ) : (
                <ul className="divide-y divide-hairline border-y border-hairline">
                  {generated.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setOpenTask(t.id)}
                        className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm font-semibold hover:text-brand-text"
                      >
                        <span className="min-w-0 truncate">{t.title}</span>
                        <StatusPill status={t.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {error && <FormError>{error}</FormError>}
            {can && (
              <div className="flex flex-wrap gap-2 border-t border-hairline pt-5">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-tile border border-hairline px-4 text-xs font-bold uppercase hover:border-ink/30"
                >
                  <Pencil className="size-4" /> Editar
                </button>
                {confirmDelete ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await deleteBriefing(b.id);
                        if (r.ok) onClose();
                        else setError(r.error ?? "Não foi possível excluir.");
                      })
                    }
                    className={buttonClass("primary")}
                  >
                    Confirmar exclusão (as tarefas continuam)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-tile border border-hairline px-4 text-xs font-bold uppercase hover:border-brand hover:text-brand-text"
                  >
                    <Trash2 className="size-4" /> Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {b && <BriefingForm open={editing} onClose={() => setEditing(false)} briefing={b} />}
      {b && (
        <TaskForm
          open={creatingTask}
          onClose={() => setCreatingTask(false)}
          defaults={{ clientId: b.clientId, briefingId: b.id, brief: b.decisions }}
        />
      )}
      <TaskSheet taskId={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}
