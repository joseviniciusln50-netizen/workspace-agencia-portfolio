"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useMural } from "@/components/mural/mural-context";
import { useSessionUser } from "@/components/shell/session-context";
import { SearchField } from "@/components/ui/search-field";
import { NO_FILTER, type BoardFilter } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

const select =
  "h-11 min-w-0 flex-1 rounded-tile border border-hairline bg-paper px-3 text-base outline-none focus:border-ink md:h-10 md:flex-none md:text-sm";

/** Filtros do quadro: busca por texto, pessoa, cliente e projeto (do cliente escolhido). */
export function BoardFilters({ value, onChange, shown, total }: { value: BoardFilter; onChange: (f: BoardFilter) => void; shown: number; total: number }) {
  const me = useSessionUser();
  const { clients, projects, activePeople } = useMural();
  const active = value.client !== "todos" || value.project !== "todos" || value.person !== "todos" || Boolean(value.q?.trim());
  const clientProjects = projects.filter((p) => p.clientId === value.client);

  return (
    <div className="mb-5 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center" role="group" aria-label="Filtros do quadro">
      <span className="hidden items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-muted uppercase md:flex">
        <SlidersHorizontal className="size-3.5" /> Filtrar
      </span>
      <SearchField id="f-q" label="Buscar tarefas" value={value.q ?? ""} onChange={(q) => onChange({ ...value, q })} className="md:w-56" />
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="f-person">
          Pessoa
        </label>
        <select
          id="f-person"
          value={value.person}
          onChange={(e) => onChange({ ...value, person: e.target.value })}
          className={cn(select, value.person !== "todos" && "border-ink font-semibold")}
        >
          <option value="todos">Todas as pessoas</option>
          <option value="minhas">Só as minhas</option>
          {activePeople
            .filter((p) => p.id !== me.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor="f-client">
          Cliente
        </label>
        <select
          id="f-client"
          value={value.client}
          onChange={(e) => onChange({ ...value, client: e.target.value, project: "todos" })}
          className={cn(select, value.client !== "todos" && "border-ink font-semibold")}
        >
          <option value="todos">Todos os clientes</option>
          <option value="interno">Interno</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {clientProjects.length > 0 && (
        <>
          <label className="sr-only" htmlFor="f-project">
            Projeto
          </label>
          <select
            id="f-project"
            value={value.project}
            onChange={(e) => onChange({ ...value, project: e.target.value })}
            className={cn(select, value.project !== "todos" && "border-ink font-semibold")}
          >
            <option value="todos">Todos os projetos</option>
            {clientProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      )}
      {active && (
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="tabular-nums">
            {shown} de {total}
          </span>
          <button
            type="button"
            onClick={() => onChange(NO_FILTER)}
            className="inline-flex min-h-10 items-center gap-1 font-bold text-brand-text uppercase hover:underline"
          >
            <X className="size-3.5" /> Limpar
          </button>
        </span>
      )}
    </div>
  );
}
