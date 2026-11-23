import type { ReactNode } from "react";
import { BrandTraces } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Capa editorial das páginas principais (Início, Equipe, Clientes) — ajustes visuais 5, 6 e 7.
 *
 * - `paper`: superfície clara com o grid de diagonais e os TRAÇADOS oficiais (feitos para fundo claro)
 *   apoiados na borda de baixo. Os traçados ficam numa faixa própria, nunca atrás do texto.
 * - `ink`: superfície preta (material "Ink surface" do design system) com o grid de diagonais e uma luz
 *   vermelha contida. Use marcas NEGATIVAS no `aside`.
 *
 * O título segue a tipografia da casa (<Light> + peso 800 + <Dot />). `aside` vai à direita no desktop
 * e abaixo do texto no celular.
 */
export function PageHero({
  eyebrow,
  title,
  children,
  aside,
  tone = "paper",
  traces,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  tone?: "paper" | "ink";
  /** Só no tom claro: qual TRAÇADO oficial apoiar na borda de baixo. */
  traces?: 1 | 2;
  className?: string;
}) {
  const ink = tone === "ink";
  return (
    <header
      className={cn(
        "relative mb-8 overflow-hidden rounded-card md:mb-10",
        ink ? "bg-ink text-paper" : "border border-hairline bg-paper",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn("brand-grid-diagonal pointer-events-none absolute inset-0", ink ? "text-paper/[0.06]" : "text-ink/[0.045]")}
      />
      {ink && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-20 size-96 rounded-full bg-[radial-gradient(circle,rgb(255_0_0/0.3),transparent_65%)]"
        />
      )}
      <span aria-hidden className="absolute top-0 left-5 h-[3px] w-14 bg-brand md:left-8" />

      <div className="relative flex flex-col gap-6 px-5 pt-7 pb-6 md:flex-row md:items-end md:justify-between md:gap-10 md:px-8 md:pt-10 md:pb-8">
        <div className="min-w-0 md:max-w-xl">
          <p className={cn("text-[10px] font-bold tracking-[0.24em] uppercase", ink ? "text-paper/55" : "text-muted")}>{eyebrow}</p>
          <h1 className="mt-3 text-[2.5rem] leading-[0.95] tracking-tight break-words md:text-6xl">{title}</h1>
          {children && <div className="mt-5">{children}</div>}
        </div>
        {aside && <div className="relative shrink-0 md:max-w-sm md:flex-1">{aside}</div>}
      </div>

      {!ink && traces && (
        <div aria-hidden className="relative flex justify-end px-5 md:px-8">
          <BrandTraces variant={traces} className={traces === 1 ? "h-10 md:h-14" : "h-20 md:h-28"} />
        </div>
      )}
    </header>
  );
}
