"use client";

import { CalendarDays, CalendarRange, Check, Clock, FolderKanban, MapPin, Pencil, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ContextPicker } from "@/components/mural/context-picker";
import { useMural } from "@/components/mural/mural-context";
import { PeoplePicker, PeopleStack } from "@/components/mural/people-picker";
import { useSessionUser } from "@/components/shell/session-context";
import { buttonClass } from "@/components/ui/button";
import { Accent, Dot, Light, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { SearchField } from "@/components/ui/search-field";
import { fieldInput, fieldLabel, FormError, Sheet } from "@/components/ui/sheet";
import { createRecording, deleteRecording, deleteTask, setRecordingStatus, updateRecording } from "@/lib/mural/actions";
import {
  canEditRecording,
  canSetRecordingStatus,
  matchesSearch,
  RECORDING_STATUS_LABEL,
  recordingInputProblem,
  recordingTime,
  splitRecordings,
  type Recording,
  type RecordingStatus,
} from "@/lib/mural/model";
import { cn, daysFromNow, todayISO } from "@/lib/utils";

/*
 * Gravações — agenda de captações (dados REAIS). Separada do mural: o mural fica só com as tarefas.
 * Cada gravação aparece também no calendário do mural. Regras no banco (recording_*), espelho em model.ts.
 */

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

function dayLabel(iso: string, today: string, tomorrow: string) {
  if (iso === today) return "Hoje";
  if (iso === tomorrow) return "Amanhã";
  return longDate(iso);
}

export function RecordingsView({ initialOpenId = null }: { initialOpenId?: string | null }) {
  const { recordings, clients } = useMural();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [q, setQ] = useState("");
  const [showPast, setShowPast] = useState(false);
  const today = todayISO();
  const tomorrow = daysFromNow(1);
  const clientOf = (r: Recording) => clients.find((c) => c.id === r.clientId)?.name ?? (r.client || "Interno");

  const shown = recordings.filter((r) => matchesSearch([r.title, r.location, r.notes, clientOf(r)], q));
  const { upcoming, past } = splitRecordings(shown, today);
  const days = [...new Set(upcoming.map((r) => r.date))];

  return (
    <>
      <PageHeader
        eyebrow="Agenda de captação"
        title={
          <>
            <Light>Agenda de</Light> <Accent>gravações</Accent>
            <Dot />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/tarefas?view=calendario" className={buttonClass("outline")}>
            <CalendarRange className="size-4" /> Ver no calendário
          </Link>
          <button type="button" onClick={() => setCreating(true)} className={buttonClass("primary")}>
            <Plus className="size-4" /> Agendar gravação
          </button>
        </div>
      </PageHeader>

      {recordings.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink/15 px-6 py-14 text-center">
          <p className="text-lg">
            <span className="font-light">Nenhuma gravação</span> <strong className="font-extrabold">agendada</strong>
            <span className="text-brand">.</span>
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm font-light text-muted">
            Agende as captações com data, horário, local e a equipe que vai gravar. Elas aparecem no calendário e o mural fica só com as tarefas.
          </p>
          <button type="button" onClick={() => setCreating(true)} className={buttonClass("dark", "md", "mt-5 px-5")}>
            <Plus className="size-4" /> Agendar a primeira gravação
          </button>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center">
            <SearchField id="g-q" label="Buscar gravações" value={q} onChange={setQ} placeholder="Buscar por título, local ou cliente…" className="md:w-96" />
            {q.trim() && (
              <span className="text-xs text-muted tabular-nums">
                {shown.length} de {recordings.length}
              </span>
            )}
          </div>

          <section aria-labelledby="g-proximas">
            <SectionTitle>
              <span id="g-proximas">Próximas</span>
            </SectionTitle>
            {upcoming.length === 0 ? (
              <p className="rounded-card border border-dashed border-ink/15 py-8 text-center text-sm font-light text-muted">
                {q.trim() ? "Nenhuma gravação próxima com essa busca." : "Nenhuma gravação agendada daqui para frente."}
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {days.map((day) => (
                  <div key={day}>
                    <p className={cn("mb-2 text-[11px] font-bold tracking-[0.16em] uppercase first-letter:uppercase", day === today ? "text-brand-text" : "text-muted")}>
                      {dayLabel(day, today, tomorrow)}
                    </p>
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {upcoming
                        .filter((r) => r.date === day)
                        .map((r) => (
                          <li key={r.id}>
                            <RecordingCard r={r} client={clientOf(r)} isToday={day === today} onOpen={setOpenId} />
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-10" aria-labelledby="g-historico">
              <SectionTitle
                action={
                  <button type="button" onClick={() => setShowPast((v) => !v)} className="text-[11px] font-bold tracking-wide text-muted uppercase hover:text-ink">
                    {showPast ? "Ocultar" : `Mostrar (${past.length})`}
                  </button>
                }
              >
                <span id="g-historico">Histórico</span>
              </SectionTitle>
              {showPast && (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {past.map((r) => (
                    <li key={r.id}>
                      <RecordingCard r={r} client={clientOf(r)} onOpen={setOpenId} past today={today} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <RecordingForm open={creating} onClose={() => setCreating(false)} />
      <RecordingSheet recordingId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ cartão */

function StatusTag({ r, today }: { r: Recording; today?: string }) {
  const late = r.status === "agendada" && today && r.date < today;
  const cls =
    r.status === "realizada"
      ? "bg-ink text-paper"
      : r.status === "cancelada"
        ? "bg-transparent text-muted ring-1 ring-inset ring-ink/15 line-through"
        : late
          ? "bg-paper text-brand-text ring-1 ring-inset ring-brand/50"
          : "bg-brand text-paper";
  return (
    <span className={cn("inline-flex items-center rounded-[3px] px-2 py-[3px] text-[10px] leading-none font-bold tracking-[0.1em] whitespace-nowrap uppercase", cls)}>
      {late ? "Passou da data" : RECORDING_STATUS_LABEL[r.status]}
    </span>
  );
}

function RecordingCard({ r, client, onOpen, isToday = false, past = false, today }: { r: Recording; client: string; onOpen: (id: string) => void; isToday?: boolean; past?: boolean; today?: string }) {
  // nas "Próximas" todas estão agendadas: o selo só aparece no histórico (realizada, cancelada, passou da data)
  const { person, projects } = useMural();
  const team = r.teamIds.map((id) => person(id)).filter((p) => p !== undefined);
  const project = projects.find((p) => p.id === r.projectId);
  const d = new Date(`${r.date}T12:00:00`);
  return (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className={cn(
        "group flex w-full items-stretch gap-4 rounded-card border bg-paper p-4 text-left transition-colors hover:border-ink/30 md:p-5",
        isToday ? "border-brand/50" : "border-hairline",
        past && "opacity-75",
      )}
    >
      <span className={cn("flex w-12 shrink-0 flex-col items-center justify-center rounded-tile py-1", isToday ? "bg-brand text-paper" : "bg-mist-soft text-ink")}>
        <span className="text-2xl leading-none font-light tabular-nums">{String(d.getDate()).padStart(2, "0")}</span>
        <span className="mt-1 text-[10px] font-bold tracking-[0.12em] uppercase">{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-bold tracking-[0.16em] text-brand-text uppercase">
            {client}
            {project ? ` · ${project.name}` : ""}
          </span>
          {past && <StatusTag r={r} today={today} />}
        </span>
        <span className="text-[15px] leading-snug font-semibold break-words">{r.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {recordingTime(r)}
          </span>
          {r.location && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{r.location}</span>
            </span>
          )}
        </span>
        {team.length > 0 && (
          <span className="mt-1 flex items-center justify-between border-t border-hairline pt-2.5">
            <span className="text-[10px] font-bold tracking-[0.14em] text-muted uppercase">Equipe</span>
            <PeopleStack people={team} max={5} />
          </span>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ formulário */

/** Valores iniciais de uma nova gravação (ex.: vinda de uma tarefa de captação do mural). */
export type RecordingDefaults = Partial<Pick<Recording, "title" | "date" | "clientId" | "projectId" | "teamIds" | "notes">>;
/** Tarefa de origem: depois de agendar, pode sair do mural (se quem agenda puder excluí-la). */
export type FromTask = { id: string; canDelete: boolean };

export function RecordingForm({
  open,
  onClose,
  recording,
  defaults,
  fromTask,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  recording?: Recording;
  defaults?: RecordingDefaults;
  fromTask?: FromTask;
  onCreated?: (id: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={recording ? "Editar gravação" : "Agendar gravação"} wide>
      {open && <RecordingFormBody key={recording?.id ?? "nova"} recording={recording} defaults={defaults} fromTask={fromTask} onCreated={onCreated} onDone={onClose} />}
    </Sheet>
  );
}

function RecordingFormBody({ recording, defaults, fromTask, onCreated, onDone }: { recording?: Recording; defaults?: RecordingDefaults; fromTask?: FromTask; onCreated?: (id: string) => void; onDone: () => void }) {
  const me = useSessionUser();
  const { activePeople } = useMural();
  const d = recording ?? defaults ?? {};
  const [title, setTitle] = useState(d.title ?? "");
  const [date, setDate] = useState(d.date || todayISO());
  const [start, setStart] = useState(recording?.start ?? "");
  const [end, setEnd] = useState(recording?.end ?? "");
  const [location, setLocation] = useState(recording?.location ?? "");
  const [ctx, setCtx] = useState<{ clientId: string | null; projectId: string | null }>({ clientId: d.clientId ?? null, projectId: d.projectId ?? null });
  const [team, setTeam] = useState<string[]>(d.teamIds?.length ? d.teamIds : [me.id]);
  const [notes, setNotes] = useState(d.notes ?? "");
  const [removeTask, setRemoveTask] = useState(Boolean(fromTask?.canDelete));
  const [error, setError] = useState<string | null>(null);
  const [pending, start_] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { title, date, start, end, location, notes };
    const problem = recordingInputProblem(input);
    if (problem) return setError(problem);
    setError(null);
    start_(async () => {
      const payload = { ...input, ...ctx, teamIds: team };
      const r = recording ? await updateRecording(recording.id, payload) : await createRecording(payload);
      if (!r.ok) return setError(r.error ?? "Não foi possível salvar.");
      if (!recording && fromTask && removeTask) {
        const del = await deleteTask(fromTask.id);
        if (!del.ok) return setError(`A gravação foi agendada, mas a tarefa não saiu do mural: ${del.error ?? "erro"}`);
      }
      if (!recording && r.id) onCreated?.(r.id);
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="g-title" className={fieldLabel}>
          O que vamos gravar
        </label>
        <input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} autoFocus placeholder="Ex.: Captação do vídeo institucional" className={cn(fieldInput, "h-12")} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="g-date" className={fieldLabel}>
            Data
          </label>
          <input id="g-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(fieldInput, "h-12")} />
        </div>
        <div>
          <label htmlFor="g-start" className={fieldLabel}>
            Início
          </label>
          <input id="g-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cn(fieldInput, "h-12")} />
        </div>
        <div>
          <label htmlFor="g-end" className={fieldLabel}>
            Término
          </label>
          <input id="g-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(fieldInput, "h-12")} />
        </div>
      </div>
      <div>
        <label htmlFor="g-location" className={fieldLabel}>
          Local
        </label>
        <input id="g-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} placeholder="Ex.: Estúdio da agência · Loja do cliente" className={cn(fieldInput, "h-12")} />
      </div>
      <ContextPicker clientId={ctx.clientId} projectId={ctx.projectId} onChange={setCtx} idPrefix="g" />
      <fieldset>
        <legend className={fieldLabel}>Equipe da gravação</legend>
        <PeoplePicker people={activePeople} value={team} onChange={setTeam} meId={me.id} />
      </fieldset>
      <div>
        <label htmlFor="g-notes" className={fieldLabel}>
          Observações
        </label>
        <textarea
          id="g-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={3000}
          rows={4}
          placeholder="Roteiro, equipamentos, contato no local, figurino…"
          className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
        />
      </div>
      {fromTask?.canDelete && (
        <label className="flex min-h-11 items-center gap-3 rounded-tile bg-mist-soft px-3 text-sm">
          <input type="checkbox" checked={removeTask} onChange={(e) => setRemoveTask(e.target.checked)} className="size-5 accent-[var(--color-ink)]" />
          Tirar a tarefa do mural depois de agendar (o mural fica só com as tarefas)
        </label>
      )}
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "flex-1 sm:flex-none")}>
          {pending ? "Salvando…" : recording ? "Salvar" : "Agendar gravação"}
        </button>
        <button type="button" onClick={onDone} className={buttonClass("outline", "lg")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ detalhe */

function RecordingSheet({ recordingId, onClose }: { recordingId: string | null; onClose: () => void }) {
  const me = useSessionUser();
  const { recordings, clients, projects, person } = useMural();
  const r = recordings.find((x) => x.id === recordingId) ?? null;
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!r) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const client = clients.find((c) => c.id === r.clientId)?.name ?? (r.client || "Interno");
  const project = projects.find((p) => p.id === r.projectId);
  const canEdit = canEditRecording(me.accessLevel, me.id, r);
  const canStatus = canSetRecordingStatus(me.accessLevel, me.id, r);

  function setStatus(s: RecordingStatus) {
    setError(null);
    start(async () => {
      const res = await setRecordingStatus(r!.id, s);
      if (!res.ok) setError(res.error ?? "Não foi possível mudar o status.");
    });
  }

  return (
    <>
      <Sheet
        open={!editing}
        onClose={() => {
          setConfirmDelete(false);
          onClose();
        }}
        title={r.title}
        eyebrow={`${client} · ${RECORDING_STATUS_LABEL[r.status]}`}
        wide
      >
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Info icon={<CalendarDays className="size-4" />} label="Data">
              <span className="first-letter:uppercase">{longDate(r.date)}</span>
            </Info>
            <Info icon={<Clock className="size-4" />} label="Horário">
              {recordingTime(r)}
            </Info>
            <Info icon={<MapPin className="size-4" />} label="Local">
              {r.location || "—"}
            </Info>
            <Info icon={<FolderKanban className="size-4" />} label="Projeto">
              {project?.name ?? "—"}
            </Info>
          </dl>
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-muted uppercase">
              <Users className="size-3.5" /> Equipe da gravação
            </p>
            <p className="text-sm">{r.teamIds.map((id) => (id === me.id ? "Você" : person(id)?.name)).filter(Boolean).join(", ") || "—"}</p>
          </section>
          {r.notes && (
            <section>
              <p className="mb-2 text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Observações</p>
              <p className="text-[15px] leading-relaxed font-light whitespace-pre-line md:text-sm">{r.notes}</p>
            </section>
          )}

          {error && <FormError>{error}</FormError>}

          {canStatus && (
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-5">
              {r.status !== "realizada" && (
                <button type="button" disabled={pending} onClick={() => setStatus("realizada")} className={buttonClass("dark")}>
                  <Check className="size-4" /> Marcar como realizada
                </button>
              )}
              {r.status === "agendada" && (
                <button type="button" disabled={pending} onClick={() => setStatus("cancelada")} className={buttonClass("outline")}>
                  <X className="size-4" /> Cancelar gravação
                </button>
              )}
              {r.status !== "agendada" && (
                <button type="button" disabled={pending} onClick={() => setStatus("agendada")} className={buttonClass("outline")}>
                  <RotateCcw className="size-4" /> Voltar para agendada
                </button>
              )}
            </div>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className={buttonClass("outline")}>
                <Pencil className="size-4" /> Editar
              </button>
              {confirmDelete ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteRecording(r.id);
                      if (res.ok) onClose();
                      else setError(res.error ?? "Não foi possível excluir.");
                    })
                  }
                  className={buttonClass("danger")}
                >
                  Confirmar exclusão
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass("ghost")}>
                  <Trash2 className="size-4" /> Excluir
                </button>
              )}
            </div>
          )}
        </div>
      </Sheet>
      <RecordingForm open={editing} onClose={() => setEditing(false)} recording={r} />
    </>
  );
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">{label}</dt>
        <dd className="mt-0.5 text-[15px] font-semibold break-words md:text-sm">{children}</dd>
      </div>
    </div>
  );
}
