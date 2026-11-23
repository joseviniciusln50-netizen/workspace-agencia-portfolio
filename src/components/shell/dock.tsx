"use client";

/*
 * Dock flutuante Liquid Glass (celular/tablet): 3 atalhos + "Mais".
 * Conceito de magnificação ADAPTADO do Dock da Magic UI (MIT — magicui.design/docs/components/dock),
 * sem dependências novas (só motion/react):
 * - mouse/caneta (pointer: fine): o ÍCONE cresce perto do ponteiro — a área de toque e a posição dos botões não mudam;
 * - toque: aperto suave ao tocar (nada depende de hover);
 * - destaque do item ativo desliza entre os itens (layoutId); teclado e leitores de tela preservados.
 * Material: LiquidGlass (refração no Chromium desktop; vidro fosco no Safari/celular; sólido com "reduzir transparência").
 */

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { LiquidGlass } from "@/components/ui/liquid-glass";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "./nav-items";

const DOCK_TINT = "rgb(12 12 12 / 0.8)";
const DOCK_SHADOW =
  "inset 0 1px 0 rgb(255 255 255 / 0.20), inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 18px 40px -16px rgb(0 0 0 / 0.75), 0 6px 14px -6px rgb(0 0 0 / 0.5)";

export function MobileDock({
  items,
  pathname,
  moreOpen,
  moreActive,
  onMore,
}: {
  items: NavItem[];
  pathname: string;
  moreOpen: boolean;
  moreActive: boolean;
  onMore: () => void;
}) {
  // posição horizontal do ponteiro (só mouse/caneta); Infinity = nenhum ícone ampliado
  const pointerX = useMotionValue(Infinity);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--badge-h))] z-40 mx-auto max-w-sm lg:hidden"
      onPointerMove={(e) => e.pointerType !== "touch" && pointerX.set(e.clientX)}
      onPointerLeave={() => pointerX.set(Infinity)}
    >
      <LiquidGlass radius={999} bevelDepth={14} scale={26} aberration={1.5} frost={0.5} tint={DOCK_TINT} fallbackBlur={18} style={{ boxShadow: DOCK_SHADOW, backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.10), rgb(255 255 255 / 0.02) 55%, transparent)" }}>
        {/* reflexo do topo */}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.45),transparent)]" />
        <div className="relative flex items-center justify-between p-1.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <DockItem key={item.href} pointerX={pointerX} active={active} label={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="absolute inset-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-paper/70 focus-visible:ring-offset-0"
                >
                  <span className="sr-only">{item.label}</span>
                </Link>
                <Icon className="size-5" strokeWidth={2.2} />
              </DockItem>
            );
          })}
          <DockItem pointerX={pointerX} active={moreActive} label="Mais">
            <button
              type="button"
              onClick={onMore}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="absolute inset-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-paper/70"
            >
              <span className="sr-only">Mais</span>
            </button>
            <MoreHorizontal className="size-5" strokeWidth={2.2} />
          </DockItem>
        </div>
      </LiquidGlass>
    </nav>
  );
}

/**
 * Um item do dock. O alvo de toque é fixo (flex-1, ~52px de altura); só o ícone/rótulo animam.
 * O link/botão real cobre o item inteiro (inset-0) — o ícone e o rótulo são visuais (aria-hidden).
 */
function DockItem({ pointerX, active, label, children }: { pointerX: MotionValue<number>; active: boolean; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const distance = useTransform(pointerX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    return b ? x - (b.left + b.width / 2) : Infinity;
  });
  // magnificação só do ícone (escala), suave como na referência
  const scale = useSpring(useTransform(distance, [-110, 0, 110], [1, 1.28, 1]), { mass: 0.1, stiffness: 170, damping: 14 });
  const lift = useTransform(scale, [1, 1.28], [0, -3]);

  // o primeiro filho é o link/botão (alvo de toque); o resto é o ícone
  const [target, ...icon] = Array.isArray(children) ? children : [children];

  return (
    <motion.div ref={ref} whileTap={{ scale: 0.94 }} transition={{ type: "spring", stiffness: 600, damping: 30 }} className="relative flex h-[52px] flex-1 items-center justify-center rounded-full">
      {active && (
        <motion.span
          layoutId="dock-active"
          aria-hidden
          className="absolute inset-0 rounded-full bg-brand shadow-[0_8px_20px_-6px_rgb(255_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.35)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <motion.span aria-hidden style={{ scale, y: lift }} className={cn("pointer-events-none relative flex flex-col items-center gap-0.5", active ? "text-paper" : "text-paper/70")}>
        {icon}
        <span className="text-[10px] leading-none font-bold">{label}</span>
      </motion.span>
      {target}
    </motion.div>
  );
}
