import { describe, expect, it } from "vitest";
import { calendarEntries, monthGrid, shiftMonth } from "@/lib/mural/calendar";
import { NO_FILTER, type Briefing, type Project, type Task } from "@/lib/mural/model";

const task = (o: Partial<Task>): Task => ({
  id: "t", title: "Tarefa", client: "", brief: "", status: "a_fazer", priority: "media", due: "2026-11-20",
  briefingId: null, clientId: null, projectId: null, createdBy: "me", createdAt: "", updatedAt: "", assigneeIds: ["me"],
  checklist: [], commentCount: 0, linkCount: 0, ...o,
});
const briefing = (o: Partial<Briefing>): Briefing => ({
  id: "b", title: "Reunião", client: "", meetingDate: "2026-11-20", notes: "", decisions: "", clientId: null,
  createdBy: "outra", createdAt: "", participantIds: [], ...o,
});
const project = (o: Partial<Project>): Project => ({
  id: "p", clientId: "c1", name: "Campanha", description: "", status: "ativo", due: "2026-11-20", ...o,
});
const clients = [{ id: "c1", name: "Loja X" }];

describe("monthGrid", () => {
  it("novembro/2026 começa na segunda 26/10 e tem 42 dias", () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(g.find((d) => d.date === "2026-11-01")?.inMonth).toBe(true);
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
  });
  it("mês que começa na segunda não tem dias do mês anterior", () => {
    expect(monthGrid(2026, 5)[0]).toEqual({ date: "2026-06-01", inMonth: true }); // 01/06/2026 é segunda
  });
});

describe("shiftMonth", () => {
  it("vira o ano nos dois sentidos", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ y: 2027, m: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ y: 2025, m: 11 });
  });
});

describe("calendarEntries", () => {
  const data = {
    tasks: [task({ id: "t1" }), task({ id: "t2", due: null }), task({ id: "t3", clientId: "c1", client: "Loja X", assigneeIds: ["outra"], status: "entregue" })],
    briefings: [briefing({ id: "b1" }), briefing({ id: "b2", clientId: "c1", participantIds: ["me"] })],
    projects: [project({ id: "p1" }), project({ id: "p2", due: null })],
    clients,
  };

  it("junta tudo do dia, briefings primeiro, e ignora quem não tem data", () => {
    const day = calendarEntries(data, NO_FILTER, "me").get("2026-11-20")!;
    expect(day.map((e) => e.kind)).toEqual(["briefing", "briefing", "projeto", "tarefa", "tarefa"]);
    expect(day.find((e) => e.id === "t3")?.done).toBe(true);
    expect(day.find((e) => e.id === "p1")?.context).toBe("Loja X");
  });

  it("'Só as minhas': minhas tarefas e briefings em que participo; sem projetos", () => {
    const ids = calendarEntries(data, { ...NO_FILTER, person: "minhas" }, "me").get("2026-11-20")!.map((e) => e.id);
    expect(ids.sort()).toEqual(["b2", "t1"]);
  });

  it("cliente 'Interno': sem cliente e sem projetos", () => {
    const ids = calendarEntries(data, { ...NO_FILTER, client: "interno" }, "me").get("2026-11-20")!.map((e) => e.id);
    expect(ids.sort()).toEqual(["b1", "t1"]);
  });

  it("filtro por projeto: só o projeto e as tarefas dele (briefings somem)", () => {
    const d = { ...data, tasks: [...data.tasks, task({ id: "t4", clientId: "c1", projectId: "p1" })] };
    const ids = calendarEntries(d, { ...NO_FILTER, client: "c1", project: "p1" }, "me").get("2026-11-20")!.map((e) => e.id);
    expect(ids.sort()).toEqual(["p1", "t4"]);
  });
});

describe("calendarEntries com busca", () => {
  it("filtra tarefas, briefings e projetos pelo texto", () => {
    const data = {
      tasks: [task({ id: "t1", title: "Fotos do cardápio" }), task({ id: "t2", title: "Post" })],
      briefings: [briefing({ id: "b1", title: "Reunião sobre fotos" })],
      projects: [project({ id: "p1", name: "Campanha" })],
      clients,
    };
    const ids = calendarEntries(data, { ...NO_FILTER, q: "fotos" }, "me").get("2026-11-20")!.map((e) => e.id);
    expect(ids.sort()).toEqual(["b1", "t1"]);
    expect(calendarEntries(data, { ...NO_FILTER, q: "loja" }, "me").get("2026-11-20")!.map((e) => e.id)).toEqual(["p1"]);
  });
});
