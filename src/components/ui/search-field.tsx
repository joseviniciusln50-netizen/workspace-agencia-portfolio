"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Campo de busca padrão (ícone, 16px no celular para não dar zoom no iOS, sem o "x" azul nativo). */
export function SearchField({
  id,
  label,
  value,
  onChange,
  placeholder = "Buscar…",
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className={cn(
          "h-11 w-full rounded-tile border border-hairline bg-paper pr-3 pl-9 text-base outline-none [&::-webkit-search-cancel-button]:appearance-none placeholder:font-light placeholder:text-muted focus:border-ink md:h-10 md:text-sm",
          value.trim() && "border-ink font-semibold",
        )}
      />
    </div>
  );
}
