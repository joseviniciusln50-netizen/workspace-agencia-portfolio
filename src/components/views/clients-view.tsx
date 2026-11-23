"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useMural } from "@/components/mural/mural-context";
import { useSessionUser } from "@/components/shell/session-context";
import { PageHero } from "@/components/ui/page-hero";
import { Accent, Dot, Light } from "@/components/ui/primitives";
import { fieldInput, fieldLabel, FormError, Sheet } from "@/components/ui/sheet";
import { createClientRecord, updateClientRecord } from "@/lib/mural/actions";
import { canManageClients, clientProblem, isOpen, type Client } from "@/lib/mural/model";
import { cn, formatDue, todayISO } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

/** Clientes da agência: projetos ativos e tarefas abertas de cada um. Cadastro só pela administração. */
export function ClientsView() {
  const me = useSessionUser();
  const { clients, projects, tasks } = useMural();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const admin = canManageClients(me.accessLevel);
  const archived = clients.filter((c) => !c.active).length;
  const list = clients.filter((c) => showArchived || c.active);
  const activeClients = clients.filter((c) => c.active);
  const activeIds = new Set(activeClients.map((c) => c.id));
  const totalProjects = projects.filter((p) => p.status === "ativo" && activeIds.has(p.clientId)).length;
  const totalTasks = tasks.filter((t) => t.clientId && activeIds.has(t.clientId) && isOpen(t)).length;
  const today = todayISO();

  return (
    <>
      <PageHero
        traces={1}
        eyebrow="Carteira da agência"
        title={
          <>
            <Light>Nossos</Light> <Accent>clientes</Accent>
            <Dot />
          </>
        }
        aside={
          clients.length > 0 && (
            <dl className="grid grid-cols-3 divide-x divide-hairline rounded-card border border-hairline bg-paper">
              {[
                ["Clientes", activeClients.length],
                ["Projetos ativos", totalProjects],
                ["Tarefas abertas", totalTasks],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col px-3 py-3 md:px-4">
                  <dt className="text-[10px] leading-tight font-bold tracking-[0.14em] text-muted uppercase">{label}</dt>
                  <dd className="mt-auto pt-1 text-3xl leading-none font-light tabular-nums md:text-4xl">{value}</dd>
                </div>
              ))}
            </dl>
          )
        }
      >
        <p className="max-w-md text-[15px] leading-relaxed font-light text-muted md:text-base">
          Cada cliente reúne os seus projetos, tarefas e briefings.
        </p>
        {admin && (
          <button type="button" onClick={() => setCreating(true)} className={buttonClass("primary", "md", "mt-5")}>
            <Plus className="size-4" /> Novo cliente
          </button>
        )}
      </PageHero>

      {clients.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink/15 px-6 py-14 text-center">
          <Building2 className="mx-auto size-8 text-ink/30" />
          <p className="mt-3 text-lg">
            <span className="font-light">Nenhum cliente</span> <strong className="font-extrabold">cadastrado</strong>
            <span className="text-brand">.</span>
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm font-light text-muted">
            {admin
              ? "Cadastre os clientes para organizar tarefas, projetos e briefings por conta."
              : "A administração cadastra os clientes da agência."}
          </p>
          {admin && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={buttonClass("dark", "md", "mt-5 px-5")}
            >
              <Plus className="size-4" /> Cadastrar primeiro cliente
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {list.map((c) => {
              const activeProjects = projects.filter((p) => p.clientId === c.id && p.status === "ativo");
              const openTasks = tasks.filter((t) => t.clientId === c.id && isOpen(t));
              // Próxima entrega: o prazo mais próximo entre projetos ativos e tarefas abertas do cliente.
              const upcoming = [
                ...activeProjects.filter((p) => p.due).map((p) => ({ name: p.name, due: p.due as string })),
                ...openTasks.filter((t) => t.due).map((t) => ({ name: t.title, due: t.due as string })),
              ].sort((x, y) => x.due.localeCompare(y.due))[0];
              return (
                <li key={c.id}>
                  <Link
                    href={`/clientes/${c.id}`}
                    className={cn(
                      "group flex h-full flex-col rounded-card border border-hairline bg-paper transition-colors hover:border-ink/30",
                      !c.active && "opacity-60",
                    )}
                  >
                    <span className="flex items-start gap-4 p-4 md:p-5">
                      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-ink text-xl font-extrabold text-paper uppercase">
                        {c.name.trim().charAt(0) || "?"}
                        <span className="text-brand">.</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base leading-snug font-semibold break-words">{c.name}</span>
                        {!c.active ? (
                          <span className="mt-1 inline-block rounded-tile bg-ink px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-paper uppercase">Arquivado</span>
                        ) : (
                          <span className="mt-1 block truncate text-xs font-light text-muted">
                            {upcoming ? (
                              <>
                                Próxima entrega:{" "}
                                <span className={cn("font-semibold", upcoming.due < today ? "text-brand-text" : "text-ink")}>{formatDue(upcoming.due)}</span> · {upcoming.name}
                              </>
                            ) : (
                              "Sem prazos marcados"
                            )}
                          </span>
                        )}
                      </span>
                      <ArrowUpRight className="size-4 shrink-0 text-ink/30 transition-colors group-hover:text-brand" />
                    </span>
                    <span className="mt-auto grid grid-cols-2 border-t border-hairline">
                      <span className="px-4 py-3 md:px-5">
                        <span className="block truncate text-[10px] font-bold tracking-[0.08em] whitespace-nowrap text-muted uppercase">{activeProjects.length === 1 ? "Projeto ativo" : "Projetos ativos"}</span>
                        <span className="mt-0.5 block text-2xl leading-none font-light tabular-nums">{activeProjects.length}</span>
                      </span>
                      <span className="border-l border-hairline px-4 py-3 md:px-5">
                        <span className="block truncate text-[10px] font-bold tracking-[0.08em] whitespace-nowrap text-muted uppercase">{openTasks.length === 1 ? "Tarefa aberta" : "Tarefas abertas"}</span>
                        <span className="mt-0.5 block text-2xl leading-none font-light tabular-nums">{openTasks.length}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {archived > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="mt-6 text-[11px] font-bold tracking-wide text-muted uppercase hover:text-ink"
            >
              {showArchived ? "Ocultar arquivados" : `Mostrar arquivados (${archived})`}
            </button>
          )}
        </>
      )}

      <ClientForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function ClientForm({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Client }) {
  return (
    <Sheet open={open} onClose={onClose} title={client ? "Editar cliente" : "Novo cliente"}>
      {open && <ClientFormBody key={client?.id ?? "novo"} client={client} onDone={onClose} />}
    </Sheet>
  );
}

function ClientFormBody({ client, onDone }: { client?: Client; onDone: () => void }) {
  const [name, setName] = useState(client?.name ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [active, setActive] = useState(client?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = clientProblem(name, notes);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const r = client ? await updateClientRecord(client.id, name, notes, active) : await createClientRecord(name, notes);
      if (r.ok) onDone();
      else setError(r.error ?? "Não foi possível salvar.");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="c-name" className={fieldLabel}>
          Nome do cliente
        </label>
        <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="Ex.: Café Aurora" className={cn(fieldInput, "h-12")} />
      </div>
      <div>
        <label htmlFor="c-notes" className={fieldLabel}>
          Observações
        </label>
        <textarea
          id="c-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Contato, segmento, combinados importantes…"
          className={cn(fieldInput, "resize-y py-3 leading-relaxed")}
        />
      </div>
      {client && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} className="size-5 accent-[var(--color-ink)]" />
          Arquivar cliente (some das listas de escolha; o histórico é mantido)
        </label>
      )}
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="h-12 flex-1 rounded-tile bg-brand px-6 text-sm font-bold tracking-wide text-paper uppercase hover:brightness-110 disabled:opacity-60 sm:flex-none"
        >
          {pending ? "Salvando…" : client ? "Salvar" : "Cadastrar cliente"}
        </button>
        <button type="button" onClick={onDone} className="h-12 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase">
          Cancelar
        </button>
      </div>
    </form>
  );
}
