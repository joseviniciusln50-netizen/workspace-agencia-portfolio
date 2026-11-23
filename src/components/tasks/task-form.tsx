"use client";

import { useState, useTransition } from "react";
import { ContextPicker } from "@/components/mural/context-picker";
import { useMural } from "@/components/mural/mural-context";
import { PeoplePicker } from "@/components/mural/people-picker";
import { useSessionUser } from "@/components/shell/session-context";
import { fieldInput, fieldLabel, FormError, Sheet } from "@/components/ui/sheet";
import { createTask, updateTask } from "@/lib/mural/actions";
import { PRIORITY_LABEL, PRIORITY_ORDER, taskInputProblem, type Priority, type Task } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

/**
 * Criar (ou editar) tarefa.
 * - Administrador: escolhe responsáveis entre os membros ativos (inclusive ele mesmo).
 * - Colaborador: a tarefa é sempre para si (o banco confere).
 */
export interface TaskDefaults {
  clientId?: string | null;
  projectId?: string | null;
  brief?: string;
  briefingId?: string;
  title?: string;
}

export function TaskForm({
  open,
  onClose,
  task,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  /** Editar esta tarefa (sem responsáveis/checklist: são editados no detalhe). */
  task?: Task;
  /** Valores iniciais ao criar (ex.: a partir de um briefing ou da página do cliente). */
  defaults?: TaskDefaults;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? "Editar tarefa" : "Nova tarefa"} eyebrow={task?.client || undefined}>
      {open && <TaskFormBody key={task?.id ?? "nova"} task={task} defaults={defaults} onDone={onClose} />}
    </Sheet>
  );
}

function TaskFormBody({
  task,
  defaults,
  onDone,
}: {
  task?: Task;
  defaults?: TaskDefaults;
  onDone: () => void;
}) {
  const me = useSessionUser();
  const { activePeople, clients } = useMural();

  const [title, setTitle] = useState(task?.title ?? defaults?.title ?? "");
  const [ctx, setCtx] = useState<{ clientId: string | null; projectId: string | null }>({
    clientId: task ? task.clientId : (defaults?.clientId ?? null),
    projectId: task ? task.projectId : (defaults?.projectId ?? null),
  });
  const client = ctx.clientId ? (clients.find((c) => c.id === ctx.clientId)?.name ?? "") : "";
  const [brief, setBrief] = useState(task?.brief ?? defaults?.brief ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "media");
  const [due, setDue] = useState(task?.due ?? "");
  const [assignees, setAssignees] = useState<string[]>([me.id]);
  const [checklist, setChecklist] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { title, client, brief, priority, due: due || null };
    const problem = taskInputProblem(input);
    if (problem) return setError(problem);
    if (!task && assignees.length === 0) return setError("Escolha pelo menos um responsável.");
    setError(null);
    start(async () => {
      const res = task
        ? await updateTask(task.id, { ...input, ...ctx })
        : await createTask({ ...input, ...ctx, assigneeIds: assignees, checklist, briefingId: defaults?.briefingId });
      if (res.ok) onDone();
      else setError(res.error ?? "Não foi possível salvar.");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="task-title" className={fieldLabel}>
          Título
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          required
          autoFocus
          placeholder="Ex.: Reels de lançamento — roteiro"
          className={cn(fieldInput, "h-12")}
        />
      </div>

      <ContextPicker clientId={ctx.clientId} projectId={ctx.projectId} onChange={setCtx} idPrefix="task" />

      <div className="sm:max-w-[calc(50%-0.5rem)]">
        <label htmlFor="task-due" className={fieldLabel}>
          Prazo
        </label>
        <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(fieldInput, "h-12")} />
      </div>

      <fieldset>
        <legend className={fieldLabel}>Prioridade</legend>
        <div className="inline-flex rounded-tile border border-hairline p-1">
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={priority === p}
              onClick={() => setPriority(p)}
              className={cn(
                "h-10 rounded-[4px] px-4 text-xs font-bold transition-colors",
                priority === p ? "bg-ink text-paper" : "text-muted hover:text-ink",
              )}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </fieldset>

      {!task && (
        <fieldset>
          <legend className={fieldLabel}>Responsáveis</legend>
          <PeoplePicker people={activePeople} value={assignees} onChange={setAssignees} meId={me.id} />
        </fieldset>
      )}

      <div>
        <label htmlFor="task-brief" className={fieldLabel}>
          Briefing / descrição
        </label>
        <textarea
          id="task-brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Objetivo, referências, formato, observações…"
          className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
        />
      </div>

      {!task && (
        <div>
          <label htmlFor="task-checklist" className={fieldLabel}>
            Checklist (um item por linha)
          </label>
          <textarea
            id="task-checklist"
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
            rows={3}
            placeholder={"Roteiro\nGravação\nEdição"}
            className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
          />
        </div>
      )}

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="h-12 flex-1 rounded-tile bg-brand px-6 text-sm font-bold tracking-wide text-paper uppercase hover:brightness-110 disabled:opacity-60 sm:flex-none"
        >
          {pending ? "Salvando…" : task ? "Salvar" : "Criar tarefa"}
        </button>
        <button type="button" onClick={onDone} className="h-12 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase">
          Cancelar
        </button>
      </div>
    </form>
  );
}
