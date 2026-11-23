"use client";

import { motion } from "motion/react";
import { CalendarDays, Link2, ListChecks, MessageSquare } from "lucide-react";
import { useMural } from "@/components/mural/mural-context";
import { PeopleStack } from "@/components/mural/people-picker";
import { PriorityFlag, ProgressBar } from "@/components/ui/primitives";
import { isClosed, progress, type Task } from "@/lib/mural/model";
import { cn } from "@/lib/utils";
import { DueLabel } from "./due-label";

export function TaskCard({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { person, projects } = useMural();
  const project = task.projectId ? projects.find((p) => p.id === task.projectId)?.name : undefined;
  const assignees = task.assigneeIds.map((id) => person(id)).filter((p) => p !== undefined);
  const pct = progress(task.checklist);
  const done = task.checklist.filter((i) => i.done).length;

  return (
    <motion.button
      layout
      layoutId={`task-${task.id}`}
      onClick={() => onOpen(task.id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "w-full rounded-tile border border-hairline bg-paper p-4 text-left transition-colors hover:border-ink/30",
        task.status === "entregue" && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] font-bold tracking-[0.16em] text-brand-text uppercase">
          {task.client || "Interno"}
          {project && <span className="font-semibold tracking-[0.08em] text-muted"> · {project}</span>}
        </span>
        <PriorityFlag priority={task.priority} />
      </div>
      <p className="mt-1.5 text-[15px] leading-snug font-semibold break-words">{task.title}</p>
      {task.checklist.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2">
          <ProgressBar value={pct} />
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted tabular-nums">
            <ListChecks className="size-3.5" />
            {done}/{task.checklist.length}
          </span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
        <span className="flex min-w-0 items-center gap-3 text-xs font-medium text-muted">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            <DueLabel iso={task.due} done={isClosed(task)} />
          </span>
          {task.commentCount > 0 && (
            <span className="flex items-center gap-1 tabular-nums" aria-label={`${task.commentCount} comentários`}>
              <MessageSquare className="size-3.5" /> {task.commentCount}
            </span>
          )}
          {task.linkCount > 0 && (
            <span className="flex items-center gap-1 tabular-nums" aria-label={`${task.linkCount} links`}>
              <Link2 className="size-3.5" /> {task.linkCount}
            </span>
          )}
        </span>
        <PeopleStack people={assignees} />
      </div>
    </motion.button>
  );
}
