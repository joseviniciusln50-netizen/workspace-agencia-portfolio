import { describe, expect, it } from "vitest";
import { canNudgeTask, isOverdue, NUDGE_MAX, nudgeProblem } from "@/lib/mural/model";
import { buildNotices, NUDGE_NOTICE_TEXT, type RawEvent, type TaskRef } from "@/lib/mural/notifications";
import { pushRecipients } from "@/lib/push/rules";

// Cobrar tarefa atrasada — espelho de task_nudge (o banco decide).
const today = "2026-11-19";

describe("isOverdue / canNudgeTask", () => {
  const t = { due: "2026-11-18", status: "em_producao" as const, assigneeIds: ["ana"] };
  it("atrasada = prazo antes de hoje e ainda não aprovada/postada", () => {
    expect(isOverdue(t, today)).toBe(true);
    expect(isOverdue({ ...t, due: today }, today)).toBe(false); // vence hoje: ainda não atrasou
    expect(isOverdue({ ...t, due: null }, today)).toBe(false);
    expect(isOverdue({ ...t, status: "aprovado" }, today)).toBe(false);
    expect(isOverdue({ ...t, status: "entregue" }, today)).toBe(false);
  });
  it("qualquer pessoa cobra, desde que haja outro responsável além dela", () => {
    expect(canNudgeTask("bia", t, today)).toBe(true);
    expect(canNudgeTask("ana", t, today)).toBe(false); // só ela é responsável
    expect(canNudgeTask("ana", { ...t, assigneeIds: ["ana", "caio"] }, today)).toBe(true);
    expect(canNudgeTask("bia", { ...t, due: "2026-11-25" }, today)).toBe(false);
  });
  it("frase opcional com limite", () => {
    expect(nudgeProblem("")).toBeNull();
    expect(nudgeProblem("x".repeat(NUDGE_MAX))).toBeNull();
    expect(nudgeProblem("x".repeat(NUDGE_MAX + 1))).not.toBeNull();
  });
});

const task: TaskRef = { id: "t1", title: "Post de lançamento", createdBy: "chefe", assigneeIds: ["ana", "bia"] };
const ev = (o: Partial<RawEvent>): RawEvent => ({ id: 1, taskId: "t1", actorId: "jeff", kind: "cobranca", details: null, createdAt: "2026-11-19T10:00:00Z", ...o });

describe("cobrança no sininho e no celular", () => {
  it("avisa só os responsáveis (não quem criou), com a frase", () => {
    const e = ev({ details: { mensagem: "Preciso até as 15h" } });
    expect(buildNotices([e], [task], "ana")[0]).toMatchObject({ text: NUDGE_NOTICE_TEXT, note: "Preciso até as 15h" });
    expect(buildNotices([e], [task], "chefe")).toHaveLength(0);
    const r = pushRecipients([e], task, "jeff", "Bruno");
    expect([...r.keys()].sort()).toEqual(["ana", "bia"]);
    expect(r.get("ana")?.body).toBe("Bruno cobrou a entrega de Post de lançamento: “Preciso até as 15h”");
  });
  it("sem frase: aviso fixo; quem cobrou nunca é avisado", () => {
    const r = pushRecipients([ev({ actorId: "ana" })], task, "ana", "Ana");
    expect([...r.keys()]).toEqual(["bia"]);
    expect(r.get("bia")?.body).toBe("Ana cobrou a entrega de Post de lançamento");
    expect(buildNotices([ev({})], [task], "bia")[0].note).toBeUndefined();
  });
});
