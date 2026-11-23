"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LetteringRec } from "@/components/brand/logo";
import { Snowfall, useSeason } from "@/components/seasonal/seasonal";
import { TeamLoginShowcase } from "./team-login-showcase";
import { TEAM_SCENES } from "./team-photos";

/**
 * "Telão" da tela de acesso: a equipe REAL em cenas (TeamLoginShowcase) + moldura de câmera.
 * - Ordem e duração das cenas: TEAM_SCENES em ./team-photos.ts.
 * - Desempenho no Safari: anima só opacidade/transform (GPU); o desfoque fica apenas no card;
 *   pausa quando a aba está em segundo plano; "reduzir movimento" → só a foto coletiva, parada.
 */

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

function usePageVisible() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
}

/** Contador de câmera HH:MM:SS:FF (atualiza 1×/s; parado em segundo plano). */
function Timecode({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}:${pad((seconds * 7) % 24)}`;
  return <span className="font-mono text-[10px] tracking-[0.18em] text-paper/55 tabular-nums">{text}</span>;
}

export function LoginStage({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const running = visible && !reduce;
  const [scene, setScene] = useState(0);

  // cada cena tem a sua duração; o relógio só anda com a página visível e sem "reduzir movimento"
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setScene((s) => (s + 1) % TEAM_SCENES.length), TEAM_SCENES[scene]!.ms);
    return () => clearTimeout(t);
  }, [running, scene]);

  const season = useSeason();

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh overflow-x-hidden bg-ink text-paper">
        {/* ---------- Telão ---------- */}
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          {/* Grid da linguagem gráfica + diagonais */}
          <div className="brand-grid absolute inset-0 text-brand/[0.09]" />
          <svg className="absolute inset-0 size-full text-brand/[0.12]" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" vectorEffect="non-scaling-stroke" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="currentColor" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* Textura de tela: linhas finas + vinheta */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,rgb(255_255_255/0.025)_0_1px,transparent_1px_3px)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(0_0_0/0.78)_100%)]" />

          {/* Moldura de câmera */}
          <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex items-center gap-2 md:left-8">
            <span className="size-2 rounded-full bg-brand animate-[rec-blink_1.2s_steps(2,jump-none)_infinite] motion-reduce:animate-none" />
            <LetteringRec eager className="h-3.5" />
          </div>
          <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 md:right-8">
            <Timecode running={running} />
          </div>
          <div className="absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--badge-h))] left-4 hidden text-[10px] font-bold tracking-[0.24em] text-paper/40 uppercase md:left-8 lg:block">
            Workspace · Take {String(scene + 1).padStart(2, "0")}
          </div>
        </div>

        {/* ---------- Composição: equipe + card ----------
            Celular: a foto coletiva num espaço próprio ACIMA do card (nunca por cima dos campos); some em telas baixas.
            Desktop: duas colunas no mesmo eixo vertical — a equipe na sua coluna, card à direita (nada atrás do vidro). */}
        <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col 2xl:max-w-7xl px-4 pt-[max(3.5rem,env(safe-area-inset-top))] pb-[calc(max(1.5rem,env(safe-area-inset-bottom))+var(--badge-h))] lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-16 lg:px-12 lg:py-16 xl:gap-24">
          <TeamLoginShowcase scene={reduce ? 0 : scene} running={running} />
          <div className="flex justify-center lg:justify-end">{children}</div>
        </main>

        {/* Tema sazonal (Natal): neve discreta numa camada PRÓPRIA acima de tudo e sem receber toques.
            Fica na frente de propósito: se passasse atrás do vidro, o navegador refaria o desfoque do card a cada quadro. */}
        {season === "natal" && <Snowfall className="fixed z-20" avoid="[data-auth-card]" />}
      </div>
    </MotionConfig>
  );
}
