"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Clapperboard, FileText, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useMural } from "@/components/mural/mural-context";
import { PeopleStack } from "@/components/mural/people-picker";
import { useSessionUser } from "@/components/shell/session-context";
import { DueLabel } from "@/components/tasks/due-label";
import { TaskForm, type TaskDefaults } from "@/components/tasks/task-form";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { Dot, ProgressBar, SectionTitle, StatusPill } from "@/components/ui/primitives";
import { fieldInput, fieldLabel, FormError, Sheet } from "@/components/ui/sheet";
import { createProject, deleteClientRecord, deleteProject, updateProject } from "@/lib/mural/actions";
import {
  byDue,
  canDeleteProject,
  canManageClients,
  clientDeleteConfirmed,
  isClosed,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  projectProblem,
  type Project,
  type ProjectStatus,
  type Task,
} from "@/lib/mural/model";
import { cn } from "@/lib/utils";
import { ClientForm } from "./clients-view";
import { buttonClass } from "@/components/ui/button";

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const PROJECT_PILL: Record<ProjectStatus, string> = {
  ativo: "bg-brand text-paper",
  pausado: "bg-mist text-ink",
  concluido: "bg-transparent text-muted ring-1 ring-inset ring-ink/15",
};

export function ClientDetailView({ clientId }: { clientId: string }) {
  const me = useSessionUser();
  const { clients, projects, tasks, briefings, recordings, person } = useMural();
  const client = clients.find((c) => c.id === clientId);
  const [editing, setEditing] = useState(false);
  const [projectForm, setProjectForm] = useState<{ open: boolean; project?: Project }>({ open: false });
  const [taskDefaults, setTaskDefaults] = useState<TaskDefaults | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const admin = canManageClients(me.accessLevel);

  if (!client) {
    return (
      <div className="py-16">
        <p className="text-lg font-semibold">Cliente não encontrado.</p>
        <Link href="/clientes" className="mt-3 inline-block text-[11px] font-bold tracking-wide text-brand-text uppercase hover:underline">
          Voltar aos clientes
        </Link>
      </div>
    );
  }

  const clientTasks = tasks.filter((t) => t.clientId === client.id);
  const openTasks = clientTasks.filter((t) => !isClosed(t)).sort(byDue);
  const delivered = clientTasks.filter((t) => t.status === "entregue").length;
  const clientProjects = projects
    .filter((p) => p.clientId === client.id)
    .sort((a, b) => PROJECT_STATUS_ORDER.indexOf(a.status) - PROJECT_STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name, "pt-BR"));
  const clientBriefings = briefings.filter((b) => b.clientId === client.id);
  const clientRecordings = recordings.filter((r) => r.clientId === client.id && r.status === "agendada").sort((a, b) => a.date.localeCompare(b.date));
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <>
      <Link href="/clientes" className="mb-6 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-muted uppercase hover:text-ink">
        <ArrowLeft className="size-3.5" /> Clientes
      </Link>

      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.24em] text-muted uppercase">
            <span className="h-[2px] w-5 bg-brand" aria-hidden />
            Cliente{!client.active && " · arquivado"}
          </p>
          <h1 className="mt-2 text-[2.25rem] leading-[0.95] font-extrabold tracking-tight break-words md:text-5xl">
            {client.name}
            <Dot />
          </h1>
          {client.notes && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed font-light whitespace-pre-line text-muted">{client.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTaskDefaults({ clientId: client.id })}
            className={buttonClass("primary")}
          >
            <Plus className="size-4" /> Nova tarefa
          </button>
          {admin && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-tile border border-hairline px-4 text-xs font-bold tracking-wide uppercase hover:border-ink/30"
            >
              <Pencil className="size-4" /> Editar
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
        <div className="flex flex-col gap-12 lg:col-span-7">
          {/* Tarefas abertas */}
          <section>
            <SectionTitle>
              Tarefas abertas <span className="font-light text-muted tabular-nums">({openTasks.length})</span>
            </SectionTitle>
            {openTasks.length === 0 ? (
              <p className="border-y border-hairline py-5 text-sm font-light text-muted">Nenhuma tarefa aberta para este cliente.</p>
            ) : (
              <ul className="divide-y divide-hairline border-y border-hairline">
                {openTasks.map((t) => (
                  <TaskLine key={t.id} task={t} project={projectName(t.projectId)} onOpen={setOpenTask} people={t.assigneeIds.map((id) => person(id)).filter((p) => p !== undefined)} />
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs font-light text-muted">
              <span className="tabular-nums">{delivered}</span> {delivered === 1 ? "tarefa postada" : "tarefas postadas"} para este cliente.
            </p>
          </section>

          {/* Gravações agendadas */}
          {clientRecordings.length > 0 && (
            <section>
              <SectionTitle>
                Gravações agendadas <span className="font-light text-muted tabular-nums">({clientRecordings.length})</span>
              </SectionTitle>
              <ul className="divide-y divide-hairline border-y border-hairline">
                {clientRecordings.map((r) => (
                  <li key={r.id}>
                    <Link href={`/gravacoes?g=${r.id}`} className="flex min-h-12 items-center gap-3 py-2.5 hover:text-brand-text">
                      <Clapperboard className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.title}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {fmtDate(r.date)}
                        {r.start ? ` · ${r.start}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Briefings */}
          <section>
            <SectionTitle>
              Briefings <span className="font-light text-muted tabular-nums">({clientBriefings.length})</span>
            </SectionTitle>
            {clientBriefings.length === 0 ? (
              <p className="border-y border-hairline py-5 text-sm font-light text-muted">Nenhum briefing registrado.</p>
            ) : (
              <ul className="divide-y divide-hairline border-y border-hairline">
                {clientBriefings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/briefings?b=${b.id}`} className="flex min-h-12 items-center gap-3 py-2.5 hover:text-brand-text">
                      <FileText className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.title}</span>
                      <span className="shrink-0 text-xs font-light text-muted">{fmtDate(b.meetingDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Projetos */}
        <aside className="lg:col-span-5">
          <SectionTitle
            action={
              admin ? (
                <button
                  type="button"
                  onClick={() => setProjectForm({ open: true })}
                  className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide text-brand-text uppercase hover:underline"
                >
                  <Plus className="size-3.5" /> Projeto
                </button>
              ) : undefined
            }
          >
            Projetos
          </SectionTitle>
          {clientProjects.length === 0 ? (
            <p className="border-y border-hairline py-5 text-sm font-light text-muted">
              {admin ? "Nenhum projeto. Crie um para agrupar as tarefas (ex.: campanha, lançamento, contrato mensal)." : "Nenhum projeto ainda."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {clientProjects.map((p) => {
                const pt = tasks.filter((t) => t.projectId === p.id);
                const done = pt.filter((t) => t.status === "entregue").length;
                const pct = pt.length ? Math.round((done / pt.length) * 100) : 0;
                return (
                  <li key={p.id} className="rounded-card border border-hairline bg-paper p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderKanban className="size-4 shrink-0 text-brand-text" />
                        <span className="text-[15px] font-semibold break-words">{p.name}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-[3px] px-2 py-[3px] text-[10px] font-bold tracking-[0.1em] uppercase", PROJECT_PILL[p.status])}>
                        {PROJECT_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    {p.description && <p className="mt-2 line-clamp-3 text-sm font-light text-muted">{p.description}</p>}
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={pct} />
                      <span className="shrink-0 text-[11px] font-medium text-muted tabular-nums">
                        {done}/{pt.length} postadas
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" /> {p.due ? fmtDate(p.due) : "Sem prazo"}
                      </span>
                      <span className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setTaskDefaults({ clientId: client.id, projectId: p.id })}
                          className="text-[11px] font-bold tracking-wide text-brand-text uppercase hover:underline"
                        >
                          + Tarefa
                        </button>
                        {admin && (
                          <button
                            type="button"
                            onClick={() => setProjectForm({ open: true, project: p })}
                            className="text-[11px] font-bold tracking-wide uppercase hover:underline"
                          >
                            Editar
                          </button>
                        )}
                        {canDeleteProject(me.accessLevel, p) && (
                          <button
                            type="button"
                            onClick={() => setDeletingProject(p)}
                            className="text-[11px] font-bold tracking-wide text-brand-text uppercase hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {admin && (
        <section className="mt-14 rounded-card border border-brand/30 p-5 md:p-6" aria-labelledby="zona-sensivel">
          <p id="zona-sensivel" className="text-[10px] font-bold tracking-[0.2em] text-brand-text uppercase">
            Zona sensível
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm font-light text-muted">
              Apagar o cliente remove esta página e os projetos dele. Tarefas, briefings e gravações continuam no histórico, com o nome do cliente.
              Se ele só pausou, prefira <strong className="font-semibold text-ink">arquivar</strong> em Editar.
            </p>
            <button type="button" onClick={() => setDeleting(true)} className={buttonClass("danger")}>
              <Trash2 className="size-4" /> Apagar cliente
            </button>
          </div>
        </section>
      )}

      <ClientForm open={editing} onClose={() => setEditing(false)} client={client} />
      <DeleteClientSheet open={deleting} onClose={() => setDeleting(false)} clientId={client.id} name={client.name} counts={{ projects: clientProjects.length, tasks: clientTasks.length, briefings: clientBriefings.length }} />
      <DeleteProjectSheet
        project={deletingProject}
        onClose={() => setDeletingProject(null)}
        tasks={deletingProject ? tasks.filter((t) => t.projectId === deletingProject.id).length : 0}
        recordings={deletingProject ? recordings.filter((r) => r.projectId === deletingProject.id).length : 0}
      />
      <ProjectForm open={projectForm.open} project={projectForm.project} clientId={client.id} onClose={() => setProjectForm({ open: false })} />
      <TaskForm open={!!taskDefaults} onClose={() => setTaskDefaults(null)} defaults={taskDefaults ?? undefined} />
      <TaskSheet taskId={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}

function TaskLine({
  task,
  project,
  people,
  onOpen,
}: {
  task: Task;
  project?: string;
  people: { id: string; name: string; avatar: string | null; active: boolean }[];
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-tile px-2 py-3 text-left transition-colors hover:bg-mist-soft"
      >
        <DueLabel iso={task.due} className="w-20 shrink-0 text-xs font-medium text-muted tabular-nums" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{task.title}</span>
          <span className="block truncate text-xs font-light text-muted">{project ?? "Sem projeto"}</span>
        </span>
        <span className="hidden shrink-0 sm:block">
          <StatusPill status={task.status} />
        </span>
        <PeopleStack people={people} max={2} />
      </button>
    </li>
  );
}

function ProjectForm({ open, onClose, project, clientId }: { open: boolean; onClose: () => void; project?: Project; clientId: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={project ? "Editar projeto" : "Novo projeto"}>
      {open && <ProjectFormBody key={project?.id ?? "novo"} project={project} clientId={clientId} onDone={onClose} />}
    </Sheet>
  );
}

function ProjectFormBody({ project, clientId, onDone }: { project?: Project; clientId: string; onDone: () => void }) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "ativo");
  const [due, setDue] = useState(project?.due ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = projectProblem(name, description, due || null);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const r = project
        ? await updateProject(project.id, name, description, status, due || null)
        : await createProject(clientId, name, description, due || null);
      if (r.ok) onDone();
      else setError(r.error ?? "Não foi possível salvar.");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="p-name" className={fieldLabel}>
          Nome do projeto
        </label>
        <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="Ex.: Lançamento de verão" className={cn(fieldInput, "h-12")} />
      </div>
      <div>
        <label htmlFor="p-desc" className={fieldLabel}>
          Descrição
        </label>
        <textarea
          id="p-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Objetivo, entregáveis, período…"
          className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-due" className={fieldLabel}>
            Prazo
          </label>
          <input id="p-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(fieldInput, "h-12")} />
        </div>
        {project && (
          <fieldset>
            <legend className={fieldLabel}>Situação</legend>
            <div className="inline-flex rounded-tile border border-hairline p-1">
              {PROJECT_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  className={cn("h-10 rounded-[4px] px-3 text-xs font-bold transition-colors", status === s ? "bg-ink text-paper" : "text-muted hover:text-ink")}
                >
                  {PROJECT_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="h-12 flex-1 rounded-tile bg-brand px-6 text-sm font-bold tracking-wide text-paper uppercase hover:brightness-110 disabled:opacity-60 sm:flex-none"
        >
          {pending ? "Salvando…" : project ? "Salvar" : "Criar projeto"}
        </button>
        <button type="button" onClick={onDone} className="h-12 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Confirmação para apagar o cliente: digitar o nome (o banco confere de novo). */
function DeleteClientSheet({ open, onClose, clientId, name, counts }: { open: boolean; onClose: () => void; clientId: string; name: string; counts: { projects: number; tasks: number; briefings: number } }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ok = clientDeleteConfirmed(name, typed);

  function close() {
    setTyped("");
    setError(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title={`Apagar ${name}`} eyebrow="Zona sensível">
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-relaxed font-light md:text-sm">
          Isto apaga <strong className="font-semibold">a página do cliente</strong> e{" "}
          <strong className="font-semibold">{counts.projects} {counts.projects === 1 ? "projeto" : "projetos"}</strong>. Não dá para desfazer.
        </p>
        <p className="text-[15px] leading-relaxed font-light text-muted md:text-sm">
          {counts.tasks} {counts.tasks === 1 ? "tarefa" : "tarefas"} e {counts.briefings} {counts.briefings === 1 ? "briefing" : "briefings"} continuam no mural e no histórico, com o nome do cliente.
        </p>
        <div>
          <label htmlFor="del-client" className={fieldLabel}>
            Para confirmar, digite o nome do cliente
          </label>
          <input id="del-client" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" className={cn(fieldInput, "h-12")} />
        </div>
        {error && <FormError>{error}</FormError>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!ok || pending}
            onClick={() =>
              start(async () => {
                const r = await deleteClientRecord(clientId, typed);
                if (r.ok) {
                  close();
                  router.push("/clientes");
                } else setError(r.error ?? "Não foi possível apagar o cliente.");
              })
            }
            className={buttonClass("danger", "lg")}
          >
            {pending ? "Apagando…" : "Apagar cliente definitivamente"}
          </button>
          <button type="button" onClick={close} className={buttonClass("outline", "lg")}>
            Cancelar
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Confirmação para apagar um projeto CONCLUÍDO (o banco confere de novo). */
function DeleteProjectSheet({ project, onClose, tasks, recordings }: { project: Project | null; onClose: () => void; tasks: number; recordings: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setError(null);
    onClose();
  }

  return (
    <Sheet open={!!project} onClose={close} title={project ? `Apagar ${project.name}` : "Apagar projeto"} eyebrow="Projeto concluído">
      {project && (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed font-light md:text-sm">
            O projeto sai da página do cliente e dos filtros. Não dá para desfazer.
          </p>
          <p className="text-[15px] leading-relaxed font-light text-muted md:text-sm">
            {tasks} {tasks === 1 ? "tarefa" : "tarefas"} e {recordings} {recordings === 1 ? "gravação" : "gravações"} continuam no mural e no histórico, ligadas ao cliente, mas sem projeto.
          </p>
          {error && <FormError>{error}</FormError>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteProject(project.id);
                  if (r.ok) close();
                  else setError(r.error ?? "Não foi possível apagar o projeto.");
                })
              }
              className={buttonClass("danger", "lg")}
            >
              {pending ? "Apagando…" : "Apagar projeto"}
            </button>
            <button type="button" onClick={close} className={buttonClass("outline", "lg")}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
