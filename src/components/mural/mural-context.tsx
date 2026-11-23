"use client";

import { createContext, use, useMemo, type ReactNode } from "react";
import type { MuralData, Person } from "@/lib/mural/model";

interface MuralCtx extends MuralData {
  person: (id: string | null | undefined) => Person | undefined;
  /** Membros ATIVOS (para atribuir tarefas e marcar participantes). */
  activePeople: Person[];
}

const Ctx = createContext<MuralCtx | null>(null);

/** Dados REAIS do mural, carregados no servidor (RLS) e atualizados após cada ação (refresh). */
export function MuralProvider({ data, children }: { data: MuralData; children: ReactNode }) {
  const value = useMemo<MuralCtx>(() => {
    const byId = new Map(data.people.map((p) => [p.id, p]));
    return {
      ...data,
      person: (id) => (id ? byId.get(id) : undefined),
      activePeople: data.people.filter((p) => p.active),
    };
  }, [data]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useMural(): MuralCtx {
  const v = use(Ctx);
  if (!v) throw new Error("useMural precisa estar dentro de <MuralProvider>.");
  return v;
}
