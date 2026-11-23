"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { BrandMonogram } from "@/components/brand/logo";
import { SantaHat, useSeason } from "@/components/seasonal/seasonal";
import { LiquidGlass } from "@/components/ui/liquid-glass";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const CARD_WIDTH = "w-full max-w-sm self-center md:max-w-md lg:self-auto";
/** Vidro escuro: transparente o bastante para ver o telão, opaco o bastante para os campos. */
const CARD_TINT = "rgb(11 11 11 / 0.5)";
/** Borda fina com reflexo (luz vindo de cima) + sombra longa e suave para separar do fundo. */
const CARD_SHADOW =
  "inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 0 0 1px rgb(255 255 255 / 0.09), inset 0 -1px 0 rgb(255 255 255 / 0.04), 0 40px 80px -30px rgb(0 0 0 / 0.85), 0 12px 24px -12px rgb(0 0 0 / 0.6)";

/**
 * Card Liquid Glass das telas de acesso. Refração real no Chrome/Edge/Android; vidro fosco no Safari/iPhone.
 * Os campos ficam numa camada própria (sem refração por cima do texto).
 */
export function AuthCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  const season = useSeason();
  return (
    <motion.section
      data-auth-card
      initial={{ opacity: 0, y: 28, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
      className={cn("relative", CARD_WIDTH)}
    >
      {/* Luz atrás do vidro (o vidro desfoca e refrata): vermelho da marca no alto à esquerda, branco fraco embaixo à direita */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-16 -z-10 bg-[radial-gradient(28%_24%_at_30%_24%,rgb(255_0_0/0.4),transparent_100%),radial-gradient(22%_18%_at_74%_82%,rgb(255_255_255/0.09),transparent_100%)]"
      />
      <LiquidGlass radius={28} bevelDepth={22} scale={42} aberration={2} frost={0.6} tint={CARD_TINT} style={{ boxShadow: CARD_SHADOW }}>
        {/* Reflexo do topo: brilho discreto que some até o meio do card */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgb(255_255_255/0.07),transparent)]" />
        <div className="relative p-6 md:p-8">
          <header className="flex items-start justify-between">
            <BrandMonogram eager className="h-14" />
            <span className="flex items-center gap-2 pt-1 text-[10px] font-bold tracking-[0.24em] text-paper/50 uppercase">
              Workspace <span className="h-px w-5 bg-brand" aria-hidden />
            </span>
          </header>
          <h1 className="mt-6 text-[2rem] leading-[0.95] tracking-tight md:text-[2.5rem]">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </LiquidGlass>

      {/* Gorro (tema de Natal): canto superior DIREITO, longe do monograma; nunca bloqueia toques */}
      {season === "natal" && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, y: -14, rotate: 4 }}
          animate={{ opacity: 1, y: 0, rotate: 16 }}
          transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.75 }}
          className="pointer-events-none absolute -top-6 -right-3 w-12 drop-shadow-[0_6px_10px_rgb(0_0_0/0.45)] md:-top-7 md:-right-4 md:w-14"
        >
          <SantaHat className="w-full" />
        </motion.div>
      )}
    </motion.section>
  );
}

/** Placeholder do card enquanto a tela lê os parâmetros da URL (mesmo tamanho e vidro, sem refração). */
export function AuthCardFallback() {
  return (
    <div
      aria-hidden
      className={cn("h-[26rem] backdrop-blur-xl", CARD_WIDTH)}
      style={{ borderRadius: 28, backgroundColor: CARD_TINT, boxShadow: CARD_SHADOW }}
    />
  );
}

export function Field({
  label,
  type = "text",
  className,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-bold tracking-[0.18em] text-paper/60 uppercase">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && visible ? "text" : type}
          className={cn(
            "auth-input h-12 w-full rounded-tile border border-paper/15 bg-paper/[0.06] px-4 text-base text-paper outline-none",
            "transition-[border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "placeholder:text-paper/35 hover:border-paper/25 focus:border-brand focus:bg-paper/[0.09] focus:ring-4 focus:ring-brand/20",
            isPassword && "pr-12",
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-paper/50 hover:text-paper"
          >
            {visible ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Botão principal (vermelho). Enquanto envia, o asterisco da marca gira. */
export function SubmitButton({ children, pendingText }: { children: ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <motion.button
      type="submit"
      disabled={pending}
      whileHover={pending ? undefined : { y: -1 }}
      whileTap={pending ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-tile bg-brand text-sm font-bold tracking-wide text-paper uppercase shadow-[0_10px_24px_-10px_rgb(255_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.25)] transition-[filter,box-shadow] duration-300 hover:shadow-[0_14px_30px_-10px_rgb(255_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.3)] hover:brightness-105 disabled:cursor-wait"
    >
      {/* brilho que atravessa o botão no hover (só transform; some com "reduzir movimento") */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.28),transparent)] opacity-0 transition-[transform,opacity] duration-700 ease-out group-hover:translate-x-[300%] group-hover:opacity-100 motion-reduce:hidden"
      />
      {pending ? (
        <>
          <Image
            src="/brand/web/asterisco-6-pontas.png"
            alt=""
            width={274}
            height={282}
            className="size-4 animate-spin [animation-duration:1.4s]"
          />
          {pendingText}
        </>
      ) : (
        <>
          {children} <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2.4} />
        </>
      )}
    </motion.button>
  );
}

/** Aviso (sessão expirada, saída, link inválido…) ou erro do formulário. */
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-tile border px-3.5 py-3 text-[13px] leading-snug",
        tone === "error" ? "border-brand/60 bg-brand/15 text-paper" : "border-paper/15 bg-paper/[0.06] text-paper/85",
      )}
    >
      <span className={cn("mt-1.5 h-[2px] w-3 shrink-0", tone === "error" ? "bg-brand" : "bg-paper/50")} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
