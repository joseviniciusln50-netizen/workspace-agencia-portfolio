"use client";

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { resolveSeason, type Season } from "@/lib/seasonal";
import { cn } from "@/lib/utils";

/*
 * Decoração sazonal (Natal). Camada à parte: não altera tokens, marcas nem layout.
 * Regras de quando liga/desliga em src/lib/seasonal.ts.
 */

const subscribeNothing = () => () => {};

function todayInBrasilia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function currentSeason(): Season {
  return resolveSeason({
    today: todayInBrasilia(),
    setting: process.env.NEXT_PUBLIC_TEMA_SAZONAL,
    urlParam: new URLSearchParams(window.location.search).get("tema"),
  });
}

/** Tema ativo (no servidor sempre "nenhum": a decoração aparece só no navegador, sem piscar o layout). */
export function useSeason(): Season {
  return useSyncExternalStore(subscribeNothing, currentSeason, () => null);
}

/* ---------------------------------------------------------------- neve (CSS puro) */

interface Flake {
  left: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number;
  fall: number;
}

/** Flocos determinísticos (mesma neve a cada visita; sem Math.random no render). */
function makeFlakes(n: number, seed = 7): Flake[] {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  return Array.from({ length: n }, () => ({
    left: rnd() * 100,
    size: 1.5 + rnd() * 2.5,
    opacity: 0.25 + rnd() * 0.45,
    duration: 18 + rnd() * 16,
    delay: -rnd() * 34,
    drift: (rnd() - 0.5) * 60,
    // a maioria some na metade de cima (neve concentrada no topo)
    fall: 30 + rnd() * 45,
  }));
}

const FLAKES = makeFlakes(26);

/**
 * Neve discreta; some com "reduzir movimento".
 * `avoid`: seletor de um elemento (o card) recortado da neve — os flocos somem ao chegar nele, como se
 * passassem por trás do vidro, sem nunca cobrir os campos. Recorte por máscara (custo ~zero).
 */
export function Snowfall({ className, avoid }: { className?: string; avoid?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    if (!layer || !avoid) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = document.querySelector(avoid);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = layer.style;
      s.setProperty("--hole-x", `${r.left}px`);
      s.setProperty("--hole-y", `${r.top}px`);
      s.setProperty("--hole-w", `${r.width}px`);
      s.setProperty("--hole-h", `${r.height}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const ro = new ResizeObserver(schedule);
    const target = document.querySelector(avoid);
    if (target) ro.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    // o card entra com um pequeno deslocamento: mede de novo quando a entrada termina
    const settle = setTimeout(schedule, 1200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [avoid]);

  const hole: CSSProperties | undefined = avoid
    ? ({
        "--hole-x": "-9999px",
        "--hole-y": "-9999px",
        "--hole-w": "0px",
        "--hole-h": "0px",
        WebkitMaskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
        maskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
        WebkitMaskSize: "100% 100%, var(--hole-w) var(--hole-h)",
        maskSize: "100% 100%, var(--hole-w) var(--hole-h)",
        WebkitMaskPosition: "0 0, var(--hole-x) var(--hole-y)",
        maskPosition: "0 0, var(--hole-x) var(--hole-y)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      } as CSSProperties)
    : undefined;

  return (
    <div ref={ref} aria-hidden style={hole} className={cn("pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden", className)}>
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className={cn("ajm-snowflake absolute top-0 rounded-full bg-paper", i >= 14 && "max-sm:hidden")}
          style={
            {
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              "--o": f.opacity,
              "--drift": `${f.drift}px`,
              "--fall": `${f.fall}vh`,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- gorro */

/**
 * Gorro de Papai Noel. Traçado do ícone "Santa Hat" (SVG Repo, CC0 — svgrepo.com/svg/57355),
 * pintado aqui: corpo vermelho da marca, barra e pompom brancos. Elemento à parte: NUNCA sobre o logo.
 */
export function SantaHat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 309.639 309.639" aria-hidden className={className}>
      <path
        fill="var(--color-brand)"
        d="M254.491,0c-19.851,0-36,16.149-36,36c0,1.777,0.135,3.523,0.385,5.233L144.33,70.815c-63.744,25.296-102.588,89.539-95.53,157.634c-17.145,5.198-29.65,21.022-29.65,39.689c0,22.883,18.789,41.5,41.885,41.5h148.692c23.096,0,41.886-18.617,41.886-41.5c0-20.84-15.586-38.135-35.814-41.059c-13.244-25.834-14.185-56.924-2.238-83.9l32.014-72.299c2.854,0.729,5.841,1.119,8.918,1.119c19.85,0,35.999-16.149,35.999-36S274.34,0,254.491,0z"
      />
      {/* sombra suave do corpo sob a barra */}
      <path fill="rgb(0 0 0 / 0.18)" d="M60 226 h150 c-6 -8 -10 -16 -13 -24 l-130 0 c-3 9 -5 16 -7 24z" />
      <rect x="19.15" y="226.639" width="233.462" height="83" rx="41.5" fill="#F4F4F4" />
      <rect x="19.15" y="226.639" width="233.462" height="30" rx="15" fill="#FFFFFF" />
      <circle cx="254.491" cy="36" r="36" fill="#F4F4F4" />
      <circle cx="248" cy="29" r="20" fill="#FFFFFF" />
    </svg>
  );
}
