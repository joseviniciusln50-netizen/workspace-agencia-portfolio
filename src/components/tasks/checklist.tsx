"use client";

import { motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { addChecklistItem, removeChecklistItem, toggleChecklistItem } from "@/lib/mural/actions";
import type { ChecklistItem, Task } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

/**
 * Checklist real. Marcar é otimista (responde na hora; o banco confirma).
 * Quem não pode editar (não é responsável nem administrador) vê só a leitura.
 */
export function Checklist({ task, editable, className }: { task: Task; editable: boolean; className?: string }) {
  const [items, setOptimistic] = useOptimistic(task.checklist, (state: ChecklistItem[], change: { id: string; done: boolean }) =>
    state.map((i) => (i.id === change.id ? { ...i, done: change.done } : i)),
  );
  const [, start] = useTransition();
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  function toggle(item: ChecklistItem) {
    if (!editable) return;
    start(async () => {
      setOptimistic({ id: item.id, done: !item.done });
      const r = await toggleChecklistItem(item.id, !item.done);
      if (!r.ok) setError(r.error ?? "Não foi possível marcar.");
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const label = newItem.trim();
    if (!label) return;
    startAdding(async () => {
      const r = await addChecklistItem(task.id, label);
      if (r.ok) setNewItem("");
      else setError(r.error ?? "Não foi possível adicionar.");
    });
  }

  return (
    <div className={className}>
      {items.length === 0 && !editable && <p className="py-2 text-sm font-light text-muted">Sem itens.</p>}
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggle(item)}
              role="checkbox"
              aria-checked={item.done}
              aria-disabled={!editable}
              className={cn(
                "flex min-h-11 flex-1 items-center gap-3 rounded-tile px-2 py-2 text-left text-[15px] transition-colors md:text-sm",
                editable ? "hover:bg-ink/5" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                  item.done ? "border-ink bg-ink" : "border-ink/25",
                )}
              >
                <motion.span
                  initial={false}
                  animate={{ scale: item.done ? 1 : 0, opacity: item.done ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                  <Check className="size-3.5 text-paper" strokeWidth={3.5} />
                </motion.span>
              </span>
              <span className={cn("relative font-medium break-words transition-colors", item.done && "text-muted")}>
                {item.label}
                <motion.span
                  aria-hidden
                  className="absolute top-1/2 left-0 h-[1.5px] bg-brand"
                  initial={false}
                  animate={{ width: item.done ? "100%" : "0%" }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
            </button>
            {editable && (
              <button
                type="button"
                aria-label={`Remover item ${item.label}`}
                onClick={() => start(async () => void (await removeChecklistItem(item.id)))}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted opacity-60 hover:bg-ink/5 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <label htmlFor={`novo-item-${task.id}`} className="sr-only">
            Novo item do checklist
          </label>
          <input
            id={`novo-item-${task.id}`}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            maxLength={200}
            placeholder="Adicionar item…"
            className="h-11 min-w-0 flex-1 rounded-tile border border-hairline bg-paper px-3 text-base outline-none focus:border-ink md:text-sm"
          />
          <button
            type="submit"
            disabled={adding || !newItem.trim()}
            aria-label="Adicionar item"
            className="flex size-11 items-center justify-center rounded-tile bg-ink text-paper disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-brand-text">
          {error}
        </p>
      )}
    </div>
  );
}
