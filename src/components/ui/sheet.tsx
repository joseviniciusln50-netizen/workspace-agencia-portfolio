"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

/**
 * Painel modal: no celular sobe do rodapé (arrastar a ALÇA para fechar); no desktop, centralizado.
 * - Portal no <body> (o <main> tem z-10).
 * - Arraste só pela alça + `touch-action: pan-y` no conteúdo: a rolagem por toque do iOS continua funcionando.
 * - Respeita a área segura do iPhone e a faixa "Powered by Netlify" (--badge-h).
 */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const mounted = useMounted();
  const drag = useDragControls();
  const desktop = useIsDesktop();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          {/* Véu (camada Overlay): escurece e desfoca levemente o que está atrás */}
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          />
          {/* Painel: superfície SÓLIDA (leitura/escrita), com reflexo fino no topo e sombra de overlay.
              Celular: sobe do rodapé. Desktop: surge do centro (escala + opacidade). */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            className={cn(
              "relative max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-paper px-5 pt-2 pb-[calc(max(1.75rem,env(safe-area-inset-bottom))+var(--badge-h))] shadow-overlay ring-1 ring-ink/5 md:rounded-card md:px-7 md:pt-0 md:pb-[calc(1.75rem+var(--badge-h))]",
              wide ? "md:max-w-2xl" : "md:max-w-lg",
            )}
            style={{ touchAction: "pan-y" }}
            initial={desktop ? { opacity: 0, scale: 0.96, y: 12 } : { y: "100%", opacity: 0.6 }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0, opacity: 1 }}
            exit={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%", opacity: 0 }}
            transition={desktop ? { type: "spring", stiffness: 420, damping: 34 } : { type: "spring", stiffness: 300, damping: 32 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              aria-hidden
              onPointerDown={(e) => drag.start(e)}
              className="-mx-5 mb-2 flex cursor-grab touch-none justify-center pt-1 pb-3 active:cursor-grabbing md:hidden"
            >
              <span className="h-1 w-10 rounded-full bg-ink/20" />
            </div>
            {/* Cabeçalho fixo: o título continua visível ao rolar conteúdos longos (tarefa, briefing) */}
            <header className="sticky top-0 z-10 -mx-5 flex items-start justify-between gap-4 border-b border-transparent bg-paper/92 px-5 pt-1 pb-3 backdrop-blur-md md:-mx-7 md:px-7 md:pt-6">
              <div className="min-w-0">
                {eyebrow && <p className="text-[10px] font-bold tracking-[0.2em] text-brand-text uppercase">{eyebrow}</p>}
                <h2 className="mt-1 text-xl leading-tight font-extrabold break-words">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink/5 transition-colors hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="mt-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Tela de computador (md+): o painel surge do centro; no celular, sobe do rodapé. */
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

/* ----------------------------------------------------------- campos de formulário */

export const fieldLabel = "mb-1.5 block text-[10px] font-bold tracking-[0.18em] text-muted uppercase";
export const fieldInput =
  "w-full rounded-tile border border-hairline bg-paper px-3.5 text-base outline-none transition-[border-color,box-shadow] duration-200 ease-brand hover:border-ink/25 focus:border-ink focus:ring-4 focus:ring-ink/[0.06] md:text-sm";

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm font-semibold text-brand-text">
      {children}
    </p>
  );
}
