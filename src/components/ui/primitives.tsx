"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Hierarquia tipográfica (ajuste 4)
   - Títulos combinam peso LEVE (300) e peso EXTRA (800): <Light> + <Accent>
   - Palavra-chave em vermelho institucional: <Accent>
   - Rótulos: caixa alta, 10–11px, tracking largo, peso bold
   ------------------------------------------------------------------ */

/** Palavra-chave em destaque: extrabold + vermelho institucional.
 *  Para texto GRANDE (≥ 18px) ou sobre preto. Em texto pequeno sobre branco use `tone="text"`. */
export function Accent({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "text" | "ink" }) {
  return (
    <strong
      className={cn(
        "font-extrabold",
        tone === "brand" && "text-brand",
        tone === "text" && "text-brand-text",
        tone === "ink" && "text-current",
      )}
    >
      {children}
    </strong>
  );
}

/** Trecho em peso leve dentro de um título. */
export function Light({ children }: { children: ReactNode }) {
  return <span className="font-light">{children}</span>;
}

/** Ponto vermelho de assinatura no fim dos títulos. */
export function Dot() {
  return <span className="text-brand">.</span>;
}

export function ProgressBar({ value, dark = false }: { value: number; dark?: boolean }) {
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-[1px]", dark ? "bg-paper/15" : "bg-mist")}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn("h-full", value === 100 ? "bg-ink" : "bg-brand", dark && value === 100 && "bg-paper")}
        initial={false}
        animate={{ width: `${value}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      />
    </div>
  );
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  a_fazer: "bg-mist text-ink",
  em_producao: "bg-brand text-paper",
  em_revisao: "bg-ink text-paper",
  ajustes: "bg-paper text-brand-text ring-1 ring-inset ring-brand/50",
  aprovado: "bg-paper text-ink ring-1 ring-inset ring-ink/40",
  entregue: "bg-transparent text-muted ring-1 ring-inset ring-ink/15",
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-2 py-[3px] text-[10px] leading-none font-bold tracking-[0.1em] whitespace-nowrap uppercase",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityFlag({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-[3px] rounded-[1px]",
              i <= ["baixa", "media", "alta"].indexOf(priority) ? "bg-brand" : "bg-mist",
            )}
          />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Rótulo de seção com divisória fina terminando em traço vermelho (como o topo da prancha). */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center gap-3", className)}>
      <h2 className="text-[11px] font-bold tracking-[0.18em] whitespace-nowrap uppercase">{children}</h2>
      <span className="flex flex-1 items-center" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="h-[2px] w-5 bg-brand" />
      </span>
      {action}
    </div>
  );
}

/** Cabeçalho editorial de página: eyebrow com traço vermelho + título leve/pesado + divisória. */
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-hairline pb-5 md:mb-8 md:pb-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.24em] text-muted uppercase">
          <span className="h-[2px] w-5 bg-brand" aria-hidden />
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[2.125rem] leading-[0.95] font-light tracking-tight break-words md:text-5xl">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** Cartão/painel convencional: plano, borda fina, arredondamento contido. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-card border border-hairline bg-paper p-4 md:p-6", className)}>{children}</div>
  );
}

/** Grade de indicadores separada por divisórias finas (grid institucional). */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  accent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative bg-paper px-4 py-4 md:px-6 md:py-5", className)}>
      <p className="text-[10px] font-bold tracking-[0.18em] text-muted uppercase">{label}</p>
      <p className="mt-1.5 text-[2.5rem] leading-none font-light tracking-tight tabular-nums md:text-5xl">{value}</p>
      {accent && <span className="absolute top-4 right-4 size-1.5 rounded-full bg-brand md:top-5 md:right-5" />}
    </div>
  );
}
