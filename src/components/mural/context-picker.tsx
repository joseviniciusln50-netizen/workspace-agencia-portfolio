"use client";

import Link from "next/link";
import { useMural } from "@/components/mural/mural-context";
import { useSessionUser } from "@/components/shell/session-context";
import { fieldInput, fieldLabel } from "@/components/ui/sheet";
import { canManageClients } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

/**
 * Escolha de cliente (e, opcionalmente, projeto) a partir do CADASTRO.
 * "Interno" = sem cliente. Projetos listados: do cliente escolhido e não concluídos
 * (o projeto atual continua aparecendo mesmo se já concluído).
 */
export function ContextPicker({
  clientId,
  projectId,
  onChange,
  withProject = true,
  idPrefix,
}: {
  clientId: string | null;
  projectId: string | null;
  onChange: (next: { clientId: string | null; projectId: string | null }) => void;
  withProject?: boolean;
  idPrefix: string;
}) {
  const me = useSessionUser();
  const { clients, projects } = useMural();
  const activeClients = clients.filter((c) => c.active || c.id === clientId);
  const clientProjects = projects.filter((p) => p.clientId === clientId && (p.status !== "concluido" || p.id === projectId));

  return (
    <div className={cn("grid grid-cols-1 gap-4", withProject && "sm:grid-cols-2")}>
      <div>
        <label htmlFor={`${idPrefix}-client`} className={fieldLabel}>
          Cliente
        </label>
        <select
          id={`${idPrefix}-client`}
          value={clientId ?? ""}
          onChange={(e) => onChange({ clientId: e.target.value || null, projectId: null })}
          className={cn(fieldInput, "h-12")}
        >
          <option value="">Interno (sem cliente)</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.active ? " (arquivado)" : ""}
            </option>
          ))}
        </select>
        {clients.length === 0 && (
          <p className="mt-1.5 text-xs font-light text-muted">
            {canManageClients(me.accessLevel) ? (
              <>
                Nenhum cliente cadastrado.{" "}
                <Link href="/clientes" className="font-semibold text-brand-text underline-offset-2 hover:underline">
                  Cadastrar clientes
                </Link>
              </>
            ) : (
              "Nenhum cliente cadastrado ainda (a administração cadastra)."
            )}
          </p>
        )}
      </div>
      {withProject && (
        <div>
          <label htmlFor={`${idPrefix}-project`} className={fieldLabel}>
            Projeto
          </label>
          <select
            id={`${idPrefix}-project`}
            value={projectId ?? ""}
            disabled={!clientId || clientProjects.length === 0}
            onChange={(e) => onChange({ clientId, projectId: e.target.value || null })}
            className={cn(fieldInput, "h-12 disabled:bg-mist-soft disabled:text-muted")}
          >
            <option value="">{!clientId ? "Escolha o cliente" : clientProjects.length === 0 ? "Sem projetos ativos" : "Sem projeto"}</option>
            {clientProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
