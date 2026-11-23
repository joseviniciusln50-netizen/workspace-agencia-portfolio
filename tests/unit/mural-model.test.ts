import { describe, expect, it } from "vitest";
import {
  allowedStatuses,
  briefingInputProblem,
  byDue,
  canDeleteNote,
  canEditAssignees,
  canEditBriefing,
  canEditChecklist,
  canEditTask,
  checklistLines,
  isValidDate,
  noteProblem,
  progress,
  splitDelivered,
  STATUS_ORDER,
  taskInputProblem,
} from "@/lib/mural/model";

const ME = "me";
const OTHER = "outro";

describe("fluxo de status (espelho do banco)", () => {
  it("ordem combinada com a agência", () => {
    expect(STATUS_ORDER).toEqual(["a_fazer", "em_producao", "em_revisao", "ajustes", "aprovado", "entregue"]);
  });

  it("administrador move para qualquer status", () => {
    expect(allowedStatuses("admin", ME, { status: "em_revisao", assigneeIds: [] })).toEqual([
      "a_fazer",
      "em_producao",
      "ajustes",
      "aprovado",
      "entregue",
    ]);
    expect(allowedStatuses("principal", ME, { status: "entregue", assigneeIds: [] })).toHaveLength(5);
  });

  it("colaborador responsável: move para qualquer etapa, inclusive aprovar e entregar", () => {
    expect(allowedStatuses("colaborador", ME, { status: "em_revisao", assigneeIds: [ME] })).toEqual([
      "a_fazer",
      "em_producao",
      "ajustes",
      "aprovado",
      "entregue",
    ]);
    // corrige um clique errado: sai de "Entregue"
    expect(allowedStatuses("colaborador", ME, { status: "entregue", assigneeIds: [ME, OTHER] })).toHaveLength(5);
  });

  it("colaborador não move tarefa em que não é responsável", () => {
    expect(allowedStatuses("colaborador", ME, { status: "a_fazer", assigneeIds: [OTHER] })).toEqual([]);
    expect(allowedStatuses("colaborador", ME, { status: "aprovado", assigneeIds: [] })).toEqual([]);
  });
});

describe("permissões", () => {
  it("editar/excluir tarefa: admin sempre; colaborador só a que criou, antes da aprovação", () => {
    expect(canEditTask("admin", ME, { status: "entregue", createdBy: OTHER })).toBe(true);
    expect(canEditTask("colaborador", ME, { status: "em_producao", createdBy: ME })).toBe(true);
    expect(canEditTask("colaborador", ME, { status: "aprovado", createdBy: ME })).toBe(false);
    expect(canEditTask("colaborador", ME, { status: "a_fazer", createdBy: OTHER })).toBe(false);
  });
  it("responsáveis: todo mundo atribui", () => {
    expect(canEditAssignees("principal")).toBe(true);
    expect(canEditAssignees("admin")).toBe(true);
    expect(canEditAssignees("colaborador")).toBe(true);
  });
  it("checklist: responsáveis ou administração", () => {
    expect(canEditChecklist("colaborador", ME, { assigneeIds: [ME] })).toBe(true);
    expect(canEditChecklist("colaborador", ME, { assigneeIds: [OTHER] })).toBe(false);
    expect(canEditChecklist("admin", ME, { assigneeIds: [OTHER] })).toBe(true);
  });
  it("post-it e briefing: autor ou administração", () => {
    expect(canDeleteNote("colaborador", ME, { authorId: ME })).toBe(true);
    expect(canDeleteNote("colaborador", ME, { authorId: OTHER })).toBe(false);
    expect(canDeleteNote("admin", ME, { authorId: OTHER })).toBe(true);
    expect(canEditBriefing("colaborador", ME, { createdBy: OTHER })).toBe(false);
    expect(canEditBriefing("principal", ME, { createdBy: OTHER })).toBe(true);
  });
});

describe("validação", () => {
  const base = { title: "Reels de lançamento", client: "Café Aurora", brief: "", priority: "media" as const, due: "2026-12-01" };
  it("tarefa", () => {
    expect(taskInputProblem(base)).toBeNull();
    expect(taskInputProblem({ ...base, title: " a " })).toMatch(/título/i);
    expect(taskInputProblem({ ...base, due: "2026-02-30" })).toMatch(/prazo/i);
    expect(taskInputProblem({ ...base, due: null })).toBeNull();
    expect(taskInputProblem({ ...base, priority: "urgente" as never })).toMatch(/prioridade/i);
  });
  it("datas", () => {
    expect(isValidDate("2026-11-16")).toBe(true);
    expect(isValidDate("16/11/2026")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate(null)).toBe(true);
  });
  it("briefing", () => {
    expect(briefingInputProblem({ title: "Planejamento", client: "", meetingDate: "2026-11-16", notes: "", decisions: "" })).toBeNull();
    expect(briefingInputProblem({ title: "P", client: "", meetingDate: "2026-11-16", notes: "", decisions: "" })).toMatch(/título/i);
    expect(briefingInputProblem({ title: "Planejamento", client: "", meetingDate: "", notes: "", decisions: "" })).toMatch(/data/i);
  });
  it("post-it", () => {
    expect(noteProblem("Reunião às 15h", "red")).toBeNull();
    expect(noteProblem("   ", "red")).toMatch(/recado/i);
    expect(noteProblem("x".repeat(281), "red")).toMatch(/280/);
    expect(noteProblem("ok", "verde")).toMatch(/cor/i);
  });
  it("checklist a partir de linhas", () => {
    expect(checklistLines("- Roteiro\n\n• Gravação\n  Edição  ")).toEqual(["Roteiro", "Gravação", "Edição"]);
    expect(checklistLines(Array.from({ length: 60 }, (_, i) => `item ${i}`).join("\n"))).toHaveLength(50);
  });
});

describe("utilidades", () => {
  it("progresso do checklist", () => {
    expect(progress([])).toBe(0);
    expect(progress([{ id: "a", label: "a", done: true, position: 0 }, { id: "b", label: "b", done: false, position: 1 }])).toBe(50);
  });
  it("ordena por prazo, sem prazo por último", () => {
    const list = [{ due: null }, { due: "2026-12-01" }, { due: "2026-11-20" }];
    expect([...list].sort(byDue).map((t) => t.due)).toEqual(["2026-11-20", "2026-12-01", null]);
  });
});

describe("entregues saem do quadro depois de alguns dias (mural sem poluição)", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const t = (id: string, status: "entregue" | "aprovado", updatedAt: string) => ({ id, status, updatedAt });

  it("só entregues de até 7 dias ficam no quadro; as antigas vão para o histórico", () => {
    const r = splitDelivered(
      [t("hoje", "entregue", "2026-11-17T09:00:00Z"), t("seis-dias", "entregue", "2026-11-11T12:00:00Z"), t("antiga", "entregue", "2026-11-01T12:00:00Z"), t("aprovada", "aprovado", "2026-10-01T12:00:00Z")],
      now,
    );
    expect(r.recent.map((x) => x.id)).toEqual(["hoje", "seis-dias"]);
    expect(r.old.map((x) => x.id)).toEqual(["antiga"]);
  });

  it("tarefas não entregues nunca são escondidas por esta regra", () => {
    const r = splitDelivered([t("aprovada-antiga", "aprovado", "2026-01-01T00:00:00Z")], now);
    expect(r.recent).toEqual([]);
    expect(r.old).toEqual([]);
  });
});
