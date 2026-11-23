"use client";

/*
 * Liquid Glass — ADAPTADO de "Liquid Glass" da Aceternity UI (componente gratuito):
 * https://ui.aceternity.com/components/liquid-glass — uso interno, sem redistribuição.
 *
 * Como funciona: um mapa de deslocamento (lei de Snell sobre um "domo" com borda arredondada) entorta o
 * que está ATRÁS do elemento por um filtro SVG usado em `backdrop-filter`.
 * - Chromium (Chrome/Edge/Android): refração real nas bordas.
 * - Safari/iPhone e Firefox: não suportam `backdrop-filter: url()` → vidro fosco (blur + saturação).
 * - "Reduzir transparência": superfície sólida.
 *
 * Mudanças em relação ao original:
 * - `tint` aceita qualquer cor (o card é vidro ESCURO); fallbacks com a mesma cor.
 * - mapa calculado em 1x (no máximo): 4× menos pixels no celular, sem diferença visível na borda.
 * - modo detectado com useSyncExternalStore (sem setState em efeito; SSR = vidro fosco).
 * - sem animação contínua: o mapa só é refeito quando o tamanho muda.
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  /** Raio dos cantos em px. */
  radius?: number;
  /** Faixa da borda que curva a luz, em px. */
  bevelDepth?: number;
  /** Intensidade do deslocamento, em px. */
  scale?: number;
  /** Separação cromática na borda, em px (0 = desligada). */
  aberration?: number;
  /** Desfoque extra depois da refração, em px. */
  frost?: number;
  /** Cor do corpo do vidro (com transparência), ex.: "rgb(11 11 11 / 0.55)". */
  tint?: string;
  /** Desfoque do vidro fosco (Safari/Firefox). */
  fallbackBlur?: number;
};

type Mode = "refract" | "simple" | "opaque";

const subscribeNothing = () => () => {};

function detectMode(): Mode {
  if (window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches) return "opaque";
  // Celular/tablet (toque): vidro fosco — a refração quase não aparece em tela pequena e só gastaria bateria.
  if (isSafariLike() || !supportsUrlBackdropFilter() || window.matchMedia?.("(pointer: coarse)").matches) return "simple";
  return "refract";
}

/** Roda quando o navegador estiver ocioso (não disputa com o primeiro desenho e a digitação). */
function whenIdle(fn: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const t = setTimeout(fn, 300);
  return () => clearTimeout(t);
}

export function LiquidGlass({
  children,
  className,
  radius = 24,
  bevelDepth = 18,
  scale = 40,
  aberration = 2,
  frost = 0.6,
  tint = "rgb(11 11 11 / 0.55)",
  fallbackBlur = 22,
  style,
  ...rest
}: LiquidGlassProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<string | null>(null);
  const mode = useSyncExternalStore<Mode>(subscribeNothing, detectMode, () => "simple");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [filter, setFilter] = useState<{ id: string; svg: string } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || mode !== "refract") return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const width = box?.inlineSize ?? entry.contentRect.width;
      const height = box?.blockSize ?? entry.contentRect.height;
      setSize({ w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    if (mode !== "refract" || size.w <= 1 || size.h <= 1) return;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      build().catch(() => {
        /* sem canvas/blob: continua no vidro fosco */
      });
    });
    async function build() {
      // Meia resolução: o mapa é um degradê suave (o feImage estica para o tamanho real) → 4× menos cálculo.
      const mapUrl = await generateDisplacementBlobUrl({
        width: size.w,
        height: size.h,
        radius: Math.min(radius, size.w / 2, size.h / 2),
        bevelDepth: Math.min(bevelDepth, Math.min(size.w, size.h) / 2),
        dpr: 0.5,
      });
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = mapUrl;
      });
      if (cancelled) {
        URL.revokeObjectURL(mapUrl);
        return;
      }
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      blobRef.current = mapUrl;
      const id = `lg-${reactId}-${size.w}x${size.h}-${Date.now().toString(36)}`;
      setFilter({ id, svg: buildFilterSvg({ id, mapUrl, width: size.w, height: size.h, scale, aberration, frost }) });
    }
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [mode, size.w, size.h, radius, bevelDepth, scale, aberration, frost, reactId]);

  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    },
    [],
  );

  const frosted = `blur(${fallbackBlur}px) saturate(1.6)`;
  const backdrop =
    mode === "opaque" ? "none" : mode === "refract" && filter ? `url(#${filter.id}) blur(${Math.max(4, fallbackBlur / 3)}px) saturate(1.7)` : frosted;

  return (
    <div
      ref={rootRef}
      data-glass={mode === "refract" && filter ? "refract" : mode}
      className={cn("relative overflow-hidden", className)}
      style={{
        borderRadius: radius,
        backgroundColor: mode === "opaque" ? "var(--color-graphite)" : tint,
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        ...style,
      }}
      {...rest}
    >
      {filter ? (
        <span
          key={filter.id}
          aria-hidden
          className="pointer-events-none absolute size-0 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: filter.svg }}
        />
      ) : null}
      {children}
    </div>
  );
}

function supportsUrlBackdropFilter() {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return CSS.supports("backdrop-filter", "url(#x)") || CSS.supports("-webkit-backdrop-filter", "url(#x)");
}

function isSafariLike() {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

/* ---------------------------------------------------------------------------
 * Mapa de deslocamento — R = curva horizontal, G = vertical, B = brilho da borda, A = forma.
 * Cinza neutro (128) = sem deslocamento.
 * ------------------------------------------------------------------------- */

type DisplacementOptions = {
  width: number;
  height: number;
  radius: number;
  bevelDepth: number;
  gain?: number;
  light?: { x: number; y: number };
  dpr?: number;
};

/** Distância assinada até um retângulo arredondado centrado na origem (< 0 = dentro). */
function sdRoundedBox(px: number, py: number, halfW: number, halfH: number, r: number) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return inside + outside - r;
}

/** Inclinação do domo → desvio pela lei de Snell. `x` = 0 na borda, 1 no centro. */
function bendFromDepth(x: number) {
  const u = 1 - Math.min(1, Math.max(0, x));
  const denom = (1 - u ** 4) ** 0.75;
  if (denom < 1e-6) return 0;
  const thetaI = Math.atan(Math.min(u ** 3 / denom, 8));
  const sinT = Math.sin(thetaI) / 1.5;
  if (sinT >= 1) return Math.sin(thetaI);
  return Math.sin(thetaI - Math.asin(sinT));
}

function buildPhiTable(bevelPx: number) {
  const n = Math.max(1, Math.ceil(bevelPx));
  const phi = new Float32Array(n + 1);
  for (let d = 1; d <= n; d++) phi[d] = phi[d - 1]! + bendFromDepth(d / n);
  return phi;
}

function samplePhi(phi: Float32Array, depth: number) {
  const max = phi.length - 1;
  if (depth <= 0) return phi[0]!;
  if (depth >= max) return phi[max]!;
  const i = Math.floor(depth);
  const f = depth - i;
  return phi[i]! * (1 - f) + phi[i + 1]! * f;
}

function computeDisplacementData(opts: DisplacementOptions) {
  const dpr = opts.dpr ?? 1;
  const gain = opts.gain ?? 1.35;
  const light = opts.light ?? { x: -0.55, y: -0.85 };
  const lightLen = Math.hypot(light.x, light.y) || 1;
  const lx = light.x / lightLen;
  const ly = light.y / lightLen;

  const W = Math.max(1, Math.round(opts.width * dpr));
  const H = Math.max(1, Math.round(opts.height * dpr));
  const halfW = W / 2;
  const halfH = H / 2;
  const r = Math.min(opts.radius * dpr, halfW, halfH);
  const bevel = Math.max(1, opts.bevelDepth * dpr);
  const phi = buildPhiTable(bevel);

  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const d = sdRoundedBox(x - halfW + 0.5, py, halfW, halfH, r);
      field[y * W + x] = d > 0 ? 0 : samplePhi(phi, Math.min(bevel, -d));
    }
  }

  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5;
      const i = (y * W + x) << 2;
      const d = sdRoundedBox(px, py, halfW, halfH, r);
      if (d > 0) {
        data[i] = data[i + 1] = data[i + 2] = 128;
        data[i + 3] = 0;
        continue;
      }
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(W - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(H - 1, y + 1);
      const dPhiX = (field[y * W + x1]! - field[y * W + x0]!) / (x1 - x0 || 1);
      const dPhiY = (field[y1 * W + x]! - field[y0 * W + x]!) / (y1 - y0 || 1);
      const dx = Math.max(-1, Math.min(1, dPhiX * gain));
      const dy = Math.max(-1, Math.min(1, dPhiY * gain));

      let specular = 0;
      if (d >= -bevel) {
        const gx = sdRoundedBox(px + 1, py, halfW, halfH, r) - sdRoundedBox(px - 1, py, halfW, halfH, r);
        const gy = sdRoundedBox(px, py + 1, halfW, halfH, r) - sdRoundedBox(px, py - 1, halfW, halfH, r);
        const len = Math.hypot(gx, gy) || 1;
        const dot = (gx / len) * lx + (gy / len) * ly;
        const rim = 1 - Math.min(1, -d / bevel);
        specular = (Math.max(0, dot) + Math.max(0, -dot) * 0.35) * rim;
      }
      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = Math.round(specular * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

/** URL blob de PNG para o feImage (o WebKit recusa data: dentro de feImage). */
async function generateDisplacementBlobUrl(opts: DisplacementOptions) {
  const { data, width, height } = computeDisplacementData(opts);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode displacement map");
  return URL.createObjectURL(blob);
}

type FilterOptions = { id: string; mapUrl: string; width: number; height: number; scale: number; aberration: number; frost: number };

function buildFilterSvg({ id, mapUrl, width, height, scale, aberration, frost }: FilterOptions) {
  const pad = Math.ceil(scale + aberration + 4);
  const px = (pad / Math.max(1, width)) * 100;
  const py = (pad / Math.max(1, height)) * 100;
  const region = `x="-${px.toFixed(3)}%" y="-${py.toFixed(3)}%" width="${(100 + 2 * px).toFixed(3)}%" height="${(100 + 2 * py).toFixed(3)}%"`;
  const map = `<feImage href="${mapUrl}" xlink:href="${mapUrl}" x="0" y="0" width="${width}" height="${height}" result="map" preserveAspectRatio="none"/>`;
  const displace = (s: number, result: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;
  const body =
    aberration <= 0
      ? `${displace(scale, "rgb")}`
      : `${displace(scale + aberration, "dispR")}
  <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
  ${displace(scale, "dispG")}
  <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
  ${displace(Math.max(0, scale - aberration), "dispB")}
  <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
  <feBlend in="red" in2="green" mode="screen" result="rg"/>
  <feBlend in="rg" in2="blue" mode="screen" result="rgb"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><filter id="${id}" color-interpolation-filters="sRGB" ${region}>
  ${map}
  ${body}
  <feGaussianBlur in="rgb" stdDeviation="${frost}"/>
</filter></svg>`;
}
