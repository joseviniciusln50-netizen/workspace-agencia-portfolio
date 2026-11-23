"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { useMural } from "@/components/mural/mural-context";
import type { Note, NoteColor } from "@/lib/mural/model";
import { cn } from "@/lib/utils";

export const NOTE_STYLE: Record<NoteColor, string> = {
  paper: "bg-paper text-ink",
  mist: "bg-mist text-ink",
  red: "bg-brand text-paper",
  ink: "bg-ink text-paper",
};

export const NOTE_COLORS: { value: NoteColor; label: string }[] = [
  { value: "paper", label: "Branco" },
  { value: "mist", label: "Cinza" },
  { value: "red", label: "Vermelho" },
  { value: "ink", label: "Preto" },
];

/** Inclinação estável derivada do id (o mural não "pula" a cada atualização). */
function tiltOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.8;
}

export function PostIt({ note, onRemove, compact = false }: { note: Note; onRemove?: (id: string) => void; compact?: boolean }) {
  const { person } = useMural();
  const author = person(note.authorId);
  const dark = note.color === "red" || note.color === "ink";
  const tilt = tiltOf(note.id);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.85, rotate: tilt * 3 }}
      animate={{ opacity: 1, scale: 1, rotate: tilt }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.18 } }}
      whileHover={{ rotate: 0, scale: 1.03, y: -4 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={cn(
        "group relative flex flex-col rounded-md p-4 shadow-[0_14px_24px_-16px_rgb(0_0_0/0.45)]",
        compact ? "min-h-32 w-44 shrink-0 lg:w-auto" : "min-h-40 break-inside-avoid",
        NOTE_STYLE[note.color],
      )}
    >
      <span
        aria-hidden
        className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 rotate-[-3deg] rounded-sm bg-paper/50 shadow-sm backdrop-blur-sm"
      />
      <p className={cn("leading-snug font-semibold break-words whitespace-pre-line", compact ? "text-[13px]" : "text-sm")}>{note.text}</p>
      <footer className={cn("mt-auto pt-4 text-[10px] font-bold tracking-wider uppercase", dark ? "text-paper/70" : "text-muted")}>
        {author?.name ?? "—"} · {new Date(note.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
      </footer>
      {onRemove && (
        <button
          onClick={() => onRemove(note.id)}
          aria-label="Remover post-it"
          className={cn(
            "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-60",
            dark ? "hover:bg-paper/15" : "hover:bg-ink/10",
          )}
        >
          <X className="size-3.5" />
        </button>
      )}
    </motion.article>
  );
}
