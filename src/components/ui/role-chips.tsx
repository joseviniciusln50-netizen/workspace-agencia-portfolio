import { PROFESSIONAL_ROLES, roleLabel } from "@/lib/admin/rules";
import { cn } from "@/lib/utils";

/**
 * Funções profissionais de uma pessoa (na ordem do catálogo). Nada é exibido se não houver.
 * `tone="dark"`: para superfícies pretas (cabeçalho do perfil, painéis escuros).
 */
export function RoleChips({ codes, className, tone = "light" }: { codes: string[]; className?: string; tone?: "light" | "dark" }) {
  if (codes.length === 0) return null;
  const ordered = PROFESSIONAL_ROLES.filter((r) => codes.includes(r.code)).map((r) => r.code);
  return (
    <span className={cn("mt-1.5 flex flex-wrap gap-1", className)}>
      {ordered.map((c) => (
        <span
          key={c}
          className={cn(
            "rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase",
            tone === "dark" ? "bg-paper/10 text-paper/85 ring-1 ring-paper/10" : "bg-mist",
          )}
        >
          {roleLabel(c)}
        </span>
      ))}
    </span>
  );
}
