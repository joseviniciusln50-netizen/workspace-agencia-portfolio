import { buildNotices, RECORDING_NOTICE_TEXT, type RawEvent, type TaskRef } from "@/lib/mural/notifications";

/*
 * Notificações no celular — regras puras (testadas no Vitest).
 * Quem recebe e o texto saem das MESMAS regras do sininho (buildNotices): o push é o mesmo
 * aviso, entregue fora do app. Quem fez a ação nunca é notificado.
 */

/** Espelho de private.valid_push_endpoint (o banco decide; aqui é para recusar cedo). */
export { isAllowedEndpoint } from "./endpoint";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Agrupa notificações da mesma tarefa (a mais nova substitui a anterior). */
  tag: string;
}

/**
 * Para cada pessoa que deve ser avisada da(s) ação(ões) recém-feitas por `actorId` numa tarefa,
 * a mensagem (a mais recente, se houver mais de uma).
 */
export function pushRecipients(events: RawEvent[], task: TaskRef, actorId: string, actorName: string): Map<string, PushMessage> {
  const mine = events.filter((e) => e.actorId === actorId && e.taskId === task.id);
  const candidates = new Set<string>([...task.assigneeIds, task.createdBy]);
  for (const e of mine) {
    for (const k of ["responsaveis", "antes", "depois"]) {
      const v = e.details?.[k];
      if (Array.isArray(v)) for (const id of v) if (typeof id === "string") candidates.add(id);
    }
  }
  candidates.delete(actorId);

  const out = new Map<string, PushMessage>();
  for (const person of candidates) {
    const [latest] = buildNotices(mine, [task], person);
    if (!latest) continue;
    out.set(person, {
      title: "Workspace",
      body: `${actorName} ${latest.text} ${task.title}${latest.note ? `: “${latest.note}”` : ""}`,
      url: `/tarefas?tarefa=${task.id}`,
      tag: `tarefa-${task.id}`,
    });
  }
  return out;
}

/**
 * Gravação: quem ENTROU na equipe (por outra pessoa) recebe "Fulano colocou você na gravação X".
 * `before` = equipe antes da ação (vazia ao agendar). Mesmo texto do sininho.
 */
export function recordingPushRecipients(
  recording: { id: string; title: string },
  before: string[],
  after: string[],
  actorId: string,
  actorName: string,
): Map<string, PushMessage> {
  const out = new Map<string, PushMessage>();
  for (const person of new Set(after)) {
    if (person === actorId || before.includes(person)) continue;
    out.set(person, {
      title: "Workspace",
      body: `${actorName} ${RECORDING_NOTICE_TEXT} ${recording.title}`,
      url: `/gravacoes?g=${recording.id}`,
      tag: `gravacao-${recording.id}`,
    });
  }
  return out;
}
