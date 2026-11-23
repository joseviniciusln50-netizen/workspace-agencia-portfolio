import { cn } from "@/lib/utils";

/*
 * Botões do Workspace Premium — UMA fonte de verdade para os estilos (ver docs/DESIGN-SYSTEM.md).
 * Uso: <button className={buttonClass("primary")}>…</button> ou em <Link>.
 *  primary → vermelho da marca, ação principal da tela (1 por área)
 *  dark    → preto, ação forte secundária / em superfícies claras
 *  outline → contorno, ações neutras (Cancelar, Gerenciar)
 *  ghost   → sem borda, ações discretas
 *  danger  → contorno que fica vermelho no hover (ações destrutivas: sempre com confirmação)
 */
export type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-tile font-bold tracking-wide uppercase transition-[background-color,border-color,color,box-shadow,filter,transform] duration-200 ease-brand active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-paper shadow-brand hover:brightness-110 focus-visible:ring-brand/60",
  dark: "bg-ink text-paper hover:bg-graphite focus-visible:ring-ink/40",
  outline: "border border-hairline bg-paper text-ink hover:border-ink/35 focus-visible:ring-ink/30",
  ghost: "text-ink/75 hover:bg-ink/5 hover:text-ink focus-visible:ring-ink/30",
  danger: "border border-hairline bg-paper text-ink hover:border-brand hover:text-brand-text focus-visible:ring-brand/50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[11px]",
  md: "h-11 px-4 text-xs",
  lg: "h-12 px-6 text-sm",
};

export function buttonClass(variant: ButtonVariant = "dark", size: ButtonSize = "md", className?: string) {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}
