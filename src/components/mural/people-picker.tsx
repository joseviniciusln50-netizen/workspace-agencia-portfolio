"use client";

import { Check } from "lucide-react";
import { PersonAvatar } from "@/components/ui/person-avatar";
import type { Person } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

/** Seleção de pessoas (responsáveis, participantes) com foto e nome. Botões grandes para toque. */
export function PeoplePicker({
  people,
  value,
  onChange,
  meId,
  disabled = false,
}: {
  people: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
  meId: string;
  disabled?: boolean;
}) {
  const sorted = [...people].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name, "pt-BR")));
  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== p.id) : [...value, p.id])}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs font-semibold transition-colors disabled:opacity-60",
              on ? "border-ink bg-ink text-paper" : "border-hairline bg-paper hover:border-ink/30",
            )}
          >
            <PersonAvatar name={p.name} src={p.avatar} className="size-7 text-[10px]" ringClassName={on ? "ring-ink" : "ring-paper"} />
            <span className="max-w-[10rem] truncate">{p.id === meId ? `${p.name} (você)` : p.name}</span>
            {on && <Check className="size-3.5" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

/** Avatares empilhados (responsáveis de uma tarefa). */
export function PeopleStack({ people, max = 3 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-2">
      {shown.map((p) => (
        <PersonAvatar key={p.id} name={p.name} src={p.avatar} className="size-7 text-[10px]" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-mist text-[10px] font-bold ring-2 ring-paper">
          +{rest}
        </span>
      )}
    </span>
  );
}
