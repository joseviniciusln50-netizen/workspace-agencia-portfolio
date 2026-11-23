"use client";

import { cn, formatDue, todayISO } from "@/lib/utils";

/** Rótulo de prazo relativo ("Hoje", "Amanhã", "Atrasada", data curta ou "Sem prazo"). */
export function DueLabel({ iso, className, done = false }: { iso: string | null; className?: string; done?: boolean }) {
  if (!iso) return <span className={className}>Sem prazo</span>;
  const overdue = !done && iso < todayISO();
  return (
    <span className={cn(overdue && "font-bold text-brand-text", className)}>
      {done && iso < todayISO() ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : formatDue(iso)}
    </span>
  );
}
