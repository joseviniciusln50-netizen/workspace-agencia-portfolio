"use client";

import { BellRing, CalendarDays, Check, Clapperboard, FileText, History, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useMural } from "@/components/mural/mural-context";
import { PeoplePicker } from "@/components/mural/people-picker";
import { useSessionUser } from "@/components/shell/session-context";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { PriorityFlag, ProgressBar } from "@/components/ui/primitives";
import { fieldInput, FormError, Sheet } from "@/components/ui/sheet";
import { deleteTask, getTaskEvents, nudgeTask, setTaskAssignees, setTaskStatus } from "@/lib/mural/actions";
import {
  allowedStatuses,
  canDeleteTask,
  canEditAssignees,
  canEditChecklist,
  canEditTask,
  canNudgeTask,
  isClosed,
  NUDGE_MAX,
  progress,
  STATUS_LABEL,
  STATUS_ORDER,
  type TaskEvent,
  type TaskStatus,
} from "@/lib/mural/model";
import { cn, todayISO } from "@/lib/utils";
import { Checklist } from "./checklist";
import { DueLabel } from "./due-label";
import { TaskForm } from "./task-form";
import { TaskThread } from "./task-thread";
import { buttonClass } from "@/components/ui/button";
import { RecordingForm } from "@/components/views/recordings-view";

const label = "mb-2 text-[10px] font-bold tracking-[0.2em] text-muted uppercase";

/** Detalhe da tarefa (dados REAIS). Só aparecem habilitadas as ações que o banco permite a quem está logado. */
export function TaskSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { tasks } = useMural();
  const task = tasks.find((t) => t.id === taskId) ?? null;
  const [editing, setEditing] = useState(false);
  const [asRecording, setAsRecording] = useState(false);
  const router = useRouter();
  const me = useSessionUser();

  return (
    <>
      <Sheet open={!!task && !editing && !asRecording} onClose={onClose} title={task?.title ?? ""} eyebrow={task?.client || "Interno"}>
        {task && <TaskDetail key={task.id} taskId={task.id} onEdit={() => setEditing(true)} onDeleted={onClose} onAsRecording={() => setAsRecording(true)} />}
      </Sheet>
      {task && <TaskForm open={editing} onClose={() => setEditing(false)} task={task} />}
      {/* captação que estava no mural → vira gravação agendada (e pode sair do mural) */}
      {task && (
        <RecordingForm
          open={asRecording}
          onClose={() => setAsRecording(false)}
          defaults={{ title: task.title, date: task.due ?? undefined, clientId: task.clientId, projectId: task.projectId, teamIds: task.assigneeIds, notes: task.brief }}
          fromTask={{ id: task.id, canDelete: canDeleteTask(me.accessLevel, me.id, task) }}
          onCreated={(id) => {
            onClose();
            router.push(`/gravacoes?g=${id}`);
          }}
        />
      )}
    </>
  );
}

function TaskDetail({ taskId, onEdit, onDeleted, onAsRecording }: { taskId: string; onEdit: () => void; onDeleted: () => void; onAsRecording: () => void }) {
  const me = useSessionUser();
  const { tasks, person, activePeople, briefings } = useMural();
  // Pode sumir (excluída) enquanto o painel faz a animação de saída: nunca assuma que existe.
  const task = tasks.find((t) => t.id === taskId);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingPeople, setEditingPeople] = useState(false);
  const [people, setPeople] = useState(task?.assigneeIds ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) return null;

  const allowed = allowedStatuses(me.accessLevel, me.id, task);
  const editable = canEditTask(me.accessLevel, me.id, task);
  const briefing = briefings.find((b) => b.id === task.briefingId);
  const creator = person(task.createdBy);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) after?.();
      else setError(r.error ?? "Não foi possível concluir.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <PriorityFlag priority={task.priority} />
        <span className="inline-flex items-center gap-1.5 font-semibold text-muted">
          <CalendarDays className="size-3.5" />
          <DueLabel iso={task.due} done={isClosed(task)} />
        </span>
        {creator && <span className="font-light text-muted">Criada por {creator.id === me.id ? "você" : creator.name}</span>}
        <CopyTaskLink taskId={task.id} />
      </div>

      {canNudgeTask(me.id, task, todayISO()) && <NudgeBox key={task.id} taskId={task.id} />}

      {/* Status */}
      <section>
        <p className={label}>Status</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {STATUS_ORDER.map((s: TaskStatus) => {
            const current = task.status === s;
            const can = allowed.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={current}
                disabled={pending || current || !can}
                onClick={() => run(() => setTaskStatus(task.id, s))}
                className={cn(
                  "min-h-10 rounded-tile px-2 py-2 text-[11px] font-bold transition-colors",
                  current ? "bg-ink text-paper" : can ? "bg-mist-soft hover:bg-mist" : "bg-mist-soft/50 text-muted/60",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        {me.accessLevel === "colaborador" && !task.assigneeIds.includes(me.id) && (
          <p className="mt-2 text-xs font-light text-muted">Só os responsáveis movem esta tarefa.</p>
        )}
      </section>

      {/* Responsáveis */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Responsáveis</p>
          {canEditAssignees(me.accessLevel) && !editingPeople && (
            <button type="button" onClick={() => setEditingPeople(true)} className="text-[11px] font-bold text-brand-text uppercase hover:underline">
              Alterar
            </button>
          )}
        </div>
        {editingPeople ? (
          <div className="flex flex-col gap-3">
            <PeoplePicker people={activePeople} value={people} onChange={setPeople} meId={me.id} disabled={pending} />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || people.length === 0}
                onClick={() => run(() => setTaskAssignees(task.id, people), () => setEditingPeople(false))}
                className={buttonClass("dark", "md", "h-10")}
              >
                Salvar responsáveis
              </button>
              <button
                type="button"
                onClick={() => {
                  setPeople(task.assigneeIds);
                  setEditingPeople(false);
                }}
                className="h-10 rounded-tile border border-hairline px-4 text-xs font-bold uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {task.assigneeIds.map((id) => {
              const p = person(id);
              if (!p) return null;
              return (
                <span key={id} className="flex items-center gap-2 rounded-full bg-mist-soft py-1 pr-3 pl-1">
                  <PersonAvatar name={p.name} src={p.avatar} className="size-7 text-[10px]" />
                  <span className="text-xs font-semibold">{p.id === me.id ? "Você" : p.name}</span>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* Briefing / descrição */}
      {(task.brief || briefing) && (
        <section>
          <p className={label}>Briefing</p>
          {task.brief && <p className="text-[15px] leading-relaxed font-light whitespace-pre-line md:text-sm">{task.brief}</p>}
          {briefing && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <FileText className="size-3.5" /> Gerada a partir do briefing “{briefing.title}”
            </p>
          )}
        </section>
      )}

      {/* Checklist */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">Checklist</p>
          {task.checklist.length > 0 && <span className="text-xs font-bold tabular-nums">{progress(task.checklist)}%</span>}
        </div>
        {task.checklist.length > 0 && <ProgressBar value={progress(task.checklist)} />}
        <Checklist task={task} editable={canEditChecklist(me.accessLevel, me.id, task)} className="mt-2" />
        {task.checklist.length > 0 && progress(task.checklist) === 100 && !isClosed(task) && (
          <p className="mt-2 text-xs font-light text-muted">Checklist concluído. Quando o trabalho for aprovado, mova a tarefa para “Aprovado”.</p>
        )}
      </section>

      <TaskThread task={task} />

      <TaskHistory taskId={task.id} />

      {error && <FormError>{error}</FormError>}

      {/* qualquer membro agenda gravações: a ação fica sempre disponível */}
      <div className="flex flex-wrap gap-2 border-t border-hairline pt-5">
        <button type="button" onClick={onAsRecording} className={buttonClass("outline")}>
          <Clapperboard className="size-4" /> Agendar como gravação
        </button>
      </div>

      {(editable || canDeleteTask(me.accessLevel, me.id, task)) && (
        <div className="flex flex-wrap gap-2">
          {editable && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-11 items-center gap-2 rounded-tile border border-hairline px-4 text-xs font-bold uppercase hover:border-ink/30"
            >
              <Pencil className="size-4" /> Editar
            </button>
          )}
          {canDeleteTask(me.accessLevel, me.id, task) &&
            (confirmDelete ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteTask(task.id), onDeleted)}
                  className={buttonClass("primary")}
                >
                  Confirmar exclusão
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 rounded-tile border border-hairline px-4 text-xs font-bold uppercase">
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-11 items-center gap-2 rounded-tile border border-hairline px-4 text-xs font-bold uppercase hover:border-brand hover:text-brand-text"
              >
                <Trash2 className="size-4" /> Excluir
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Copia o link direto da tarefa (abre o mural já com ela aberta) — para mandar no WhatsApp. */
function CopyTaskLink({ taskId }: { taskId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tarefas?tarefa=${taskId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-tile px-2 text-[11px] font-bold tracking-wide text-muted uppercase hover:bg-mist-soft hover:text-ink"
    >
      {copied ? <Check className="size-3.5 text-brand-text" /> : <LinkIcon className="size-3.5" />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}

/** Tarefa atrasada: qualquer pessoa da equipe cobra os responsáveis, com uma frase opcional. */
function NudgeBox({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const r = await nudgeTask(taskId, message);
      if (r.ok) {
        setSent(true);
        setOpen(false);
        setMessage("");
      } else setError(r.error ?? "Não foi possível cobrar a tarefa.");
    });
  }

  return (
    <section className="rounded-card border border-brand/40 bg-brand/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <BellRing className="size-4 text-brand-text" />
          {sent ? "Cobrança enviada aos responsáveis." : "Esta tarefa está atrasada."}
        </p>
        {!open && !sent && (
          <button type="button" onClick={() => setOpen(true)} className={buttonClass("dark", "md", "h-10")}>
            Cobrar
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <label htmlFor={`nudge-${taskId}`} className="text-xs font-light text-muted">
            Os responsáveis recebem o aviso no sininho e no celular. A frase é opcional.
          </label>
          <input
            id={`nudge-${taskId}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={NUDGE_MAX}
            placeholder="Ex.: Preciso disso até as 15h"
            className={cn(fieldInput, "h-12")}
            disabled={pending}
          />
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={pending} className={buttonClass("dark", "md", "h-10")}>
              {pending ? "Enviando…" : "Enviar cobrança"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="h-10 rounded-tile border border-hairline px-4 text-xs font-bold uppercase"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </section>
  );
}

const EVENT_TEXT = (e: TaskEvent): string => {
  const d = e.details ?? {};
  switch (e.kind) {
    case "criada":
      return "criou a tarefa";
    case "status":
      return `mudou de “${STATUS_LABEL[d.de as TaskStatus] ?? d.de}” para “${STATUS_LABEL[d.para as TaskStatus] ?? d.para}”`;
    case "responsaveis":
      return "alterou os responsáveis";
    case "checklist":
      return d.feito ? "marcou um item do checklist" : "desmarcou um item do checklist";
    case "editada":
      return "editou a tarefa";
    case "comentario":
      return "comentou";
    case "link":
      return d.titulo ? `adicionou o link “${d.titulo}”` : "adicionou um link";
    case "cobranca":
      return d.mensagem ? `cobrou a entrega: “${d.mensagem}”` : "cobrou a entrega";
  }
};

function TaskHistory({ taskId }: { taskId: string }) {
  const { person, tasks } = useMural();
  const me = useSessionUser();
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  // Recarrega quando a tarefa muda (após qualquer ação, o refresh traz dados novos).
  const signature = JSON.stringify(tasks.find((t) => t.id === taskId) ?? null);

  useEffect(() => {
    let alive = true;
    getTaskEvents(taskId).then((ev) => alive && setEvents(ev));
    return () => {
      alive = false;
    };
  }, [taskId, signature]);

  return (
    <section>
      <p className={cn(label, "flex items-center gap-1.5")}>
        <History className="size-3.5" /> Histórico
      </p>
      {events === null ? (
        <p className="text-xs font-light text-muted">Carregando…</p>
      ) : (
        <ol className="flex flex-col gap-2 border-l border-hairline pl-4">
          {events.map((e) => {
            const who = person(e.actorId);
            return (
              <li key={e.id} className="text-xs leading-relaxed">
                <span className="font-semibold">{who ? (who.id === me.id ? "Você" : who.name) : "Alguém"}</span>{" "}
                <span className="font-light text-muted">{EVENT_TEXT(e)}</span>
                <span className="block text-[11px] font-light text-muted/80">
                  {new Date(e.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
