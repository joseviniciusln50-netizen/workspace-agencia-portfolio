"use client";

import Link from "next/link";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LiquidGlass } from "@/components/ui/liquid-glass";
import type { SessionUser } from "@/lib/auth/access";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "./nav-items";
import { AccessLabel, SignOutButton, UserAvatar } from "./user-badge";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Uma linha de contexto por destino (ajuda a escolher sem abrir). */
const HINT: Record<string, string> = {
  "/gravacoes": "Agenda de captações",
  "/clientes": "Cadastro e projetos",
  "/equipe": "Pessoas e carga de trabalho",
  "/perfil": "Foto, nome e notificações",
  "/admin": "Acessos, convites e funções",
};

/**
 * Menu "Mais" do celular: páginas secundárias + conta.
 * - Painel Liquid Glass escuro (quase opaco: legível sobre qualquer conteúdo), entrada em mola.
 * - Fecha: tocando fora, no ×, com Esc, ao escolher um item ou ARRASTANDO PELA ALÇA
 *   (arrastar o painel inteiro bloquearia a rolagem por toque no iOS).
 * - Portal no <body> (o <main> tem z-10).
 */
export function MoreSheet({
  open,
  onClose,
  items,
  user,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  user: SessionUser;
  pathname: string;
}) {
  const mounted = useMounted();
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.button
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
            className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
            className="absolute inset-x-2 bottom-2 text-paper"
          >
            <LiquidGlass
              radius={30}
              bevelDepth={16}
              scale={22}
              aberration={1}
              tint="rgb(16 16 16 / 0.9)"
              fallbackBlur={24}
              style={{
                boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 0 0 1px rgb(255 255 255 / 0.07), 0 -20px 50px -20px rgb(0 0 0 / 0.7)",
              }}
            >
              <div className="relative px-4 pt-2 pb-[calc(max(1rem,env(safe-area-inset-bottom))+var(--badge-h))]">
                {/* Alça: arraste para baixo para fechar */}
                <div
                  onPointerDown={(e) => drag.start(e)}
                  className="mx-auto flex h-6 w-24 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                  aria-hidden
                >
                  <span className="h-1 w-10 rounded-full bg-paper/30" />
                </div>

                <div className="flex items-center gap-3 px-1 pt-1 pb-4">
                  <UserAvatar user={user} className="size-11 ring-ink" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{user.name}</p>
                    <p className="truncate text-xs font-light text-paper/60">
                      <AccessLabel user={user} />
                    </p>
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Fechar"
                    className="flex size-10 items-center justify-center rounded-full bg-paper/[0.06] text-paper/75 transition-colors hover:bg-paper/12 focus-visible:ring-2 focus-visible:ring-paper/60 focus-visible:outline-none"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <nav aria-label="Mais opções" className="grid grid-cols-2 gap-2">
                  {items.map((item, i) => {
                    const active = isActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: EASE, delay: 0.06 + i * 0.04 }}
                      >
                        <Link
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group flex min-h-[5.5rem] flex-col justify-between rounded-[1.25rem] border p-3.5 transition-[background-color,border-color,transform] duration-200 active:scale-[0.98]",
                            "focus-visible:ring-2 focus-visible:ring-paper/60 focus-visible:outline-none",
                            active ? "border-brand/50 bg-brand/15" : "border-paper/[0.08] bg-paper/[0.05] hover:border-paper/15 hover:bg-paper/[0.08]",
                          )}
                        >
                          <span className="flex items-center justify-between">
                            <span
                              className={cn(
                                "flex size-9 items-center justify-center rounded-xl",
                                active ? "bg-brand text-paper shadow-[0_6px_16px_-6px_rgb(255_0_0/0.7)]" : "bg-paper/[0.07] text-paper/80",
                              )}
                            >
                              <Icon className="size-[18px]" strokeWidth={2.2} />
                            </span>
                            <ArrowUpRight className="size-4 text-paper/25 transition-colors group-hover:text-paper/60" aria-hidden />
                          </span>
                          <span className="mt-3 block">
                            <span className="block text-[15px] leading-tight font-semibold">{item.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug font-light text-paper/55">{HINT[item.href] ?? ""}</span>
                          </span>
                        </Link>
                      </motion.div>
                    );
                  })}
                </nav>

                <div className="mt-3 border-t border-paper/10 pt-2">
                  <SignOutButton className="min-h-12 w-full rounded-tile px-2 text-[15px] font-medium text-paper/70 hover:bg-paper/10 [&_svg]:size-5" />
                </div>
              </div>
            </LiquidGlass>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
