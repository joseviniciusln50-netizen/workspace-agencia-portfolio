"use client";

import { motion } from "motion/react";
import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AVATAR_SIZE } from "@/lib/profile/rules";

/**
 * Recorte quadrado da foto (arrastar para posicionar + zoom).
 * Gera 512×512 no navegador (WebP; no Safari antigo, JPEG) — só essa versão é enviada.
 * Arraste só dentro da área da foto (`touch-action: none` ali); o resto da tela rola normalmente.
 */
const VIEW = 280; // tamanho da área de recorte (px)
const EASE = [0.22, 1, 0.36, 1] as const;

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  const webp = await toBlob("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg", 0.86); // Safari sem codificador WebP
  if (jpeg) return jpeg;
  throw new Error("Não foi possível processar a imagem.");
}

export function AvatarCropper({
  file,
  onCancel,
  onConfirm,
  busy,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  busy: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);

  // Lê o arquivo como data URL (não precisa de revogação — evita a prévia "sumir" quando o
  // React monta o componente duas vezes no modo de desenvolvimento).
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setUrl(reader.result);
    reader.onerror = () => setLoadError(true);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;

  const clampFor = useCallback((x: number, y: number, cw: number, ch: number) => ({
    x: Math.min(0, Math.max(VIEW - cw, x)),
    y: Math.min(0, Math.max(VIEW - ch, y)),
  }), []);

  function onImageLoad(el: HTMLImageElement) {
    const b = Math.max(VIEW / el.naturalWidth, VIEW / el.naturalHeight);
    setImg(el);
    setZoom(1);
    setPos({ x: (VIEW - el.naturalWidth * b) / 2, y: (VIEW - el.naturalHeight * b) / 2 });
  }

  /** Zoom mantendo o ponto central da área de recorte no lugar. */
  function applyZoom(next: number) {
    const z = Math.min(3, Math.max(1, next));
    if (!img) return setZoom(z);
    const nextScale = base * z;
    const cx = (VIEW / 2 - pos.x) / scale;
    const cy = (VIEW / 2 - pos.y) / scale;
    setZoom(z);
    setPos(
      clampFor(VIEW / 2 - cx * nextScale, VIEW / 2 - cy * nextScale, img.naturalWidth * nextScale, img.naturalHeight * nextScale),
    );
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clampFor(d.px + e.clientX - d.x, d.py + e.clientY - d.y, w, h));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    const sx = -pos.x / scale;
    const sy = -pos.y / scale;
    const size = VIEW / scale;
    ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    onConfirm(await canvasToBlob(canvas));
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label="Ajustar foto">
      <motion.button
        type="button"
        aria-label="Cancelar"
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-ink/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{ background: "linear-gradient(180deg, rgb(26 26 26 / 0.97), rgb(8 8 8 / 0.98))" }}
        className="glass-ink relative w-full max-w-md rounded-t-glass px-5 pt-5 pb-[calc(max(1.5rem,env(safe-area-inset-bottom))+var(--badge-h))] md:rounded-glass md:pb-[calc(1.5rem+var(--badge-h))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg">
            <span className="font-light">Ajustar</span> <strong className="font-extrabold">foto</strong>
            <span className="text-brand">.</span>
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fechar"
            className="flex size-10 items-center justify-center rounded-full text-paper/70 hover:bg-paper/10"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm font-light text-paper/60">Arraste para posicionar. Use o zoom para aproximar.</p>

        <div className="mt-5 flex items-center justify-center gap-6">
          <div
            className="relative cursor-grab overflow-hidden rounded-tile bg-graphite active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {url && (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local (data URL)
              <img
                src={url}
                alt=""
                draggable={false}
                onLoad={(e) => onImageLoad(e.currentTarget)}
                onError={() => setLoadError(true)}
                className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
                style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px)` }}
              />
            )}
            {/* Máscara circular: mostra como a foto aparecerá */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }}
            />
            {loadError && (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-paper/80">
                Não foi possível abrir esta imagem. Tente outra (JPEG, PNG ou WebP).
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.2)}
            aria-label="Diminuir zoom"
            className="flex size-10 items-center justify-center rounded-full text-paper/70 hover:bg-paper/10"
          >
            <Minus className="size-4" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 flex-1 cursor-pointer accent-[var(--color-brand)]"
          />
          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.2)}
            aria-label="Aumentar zoom"
            className="flex size-10 items-center justify-center rounded-full text-paper/70 hover:bg-paper/10"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-12 rounded-tile border border-paper/20 text-sm font-bold tracking-wide text-paper uppercase hover:bg-paper/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !img}
            className="h-12 rounded-tile bg-brand text-sm font-bold tracking-wide text-paper uppercase hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Salvando…" : "Salvar foto"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
