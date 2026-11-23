import { describe, expect, it } from "vitest";
import { todayIn, workloadByPerson } from "@/lib/mural/workload";

describe("todayIn", () => {
  it("usa o dia de Brasília, não o do servidor em UTC", () => {
    // 17/11 às 01:30 UTC ainda é 16/11 em Brasília (UTC-3)
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-17T01:30:00Z"))).toBe("2026-11-16");
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-17T12:00:00Z"))).toBe("2026-11-17");
  });
});

describe("workloadByPerson", () => {
  const tasks = [
    { id: "a", status: "em_producao" as const, due: "2026-11-10" }, // atrasada
    { id: "b", status: "a_fazer" as const, due: "2026-11-20" },
    { id: "c", status: "a_fazer" as const, due: null },
    { id: "d", status: "entregue" as const, due: "2026-11-01" }, // fechada: não conta
    { id: "e", status: "aprovado" as const, due: "2026-11-01" }, // aberta (falta entregar), mas não "atrasada"
  ];
  const assignees = [
    { task_id: "a", profile_id: "ana" },
    { task_id: "b", profile_id: "ana" },
    { task_id: "c", profile_id: "bia" },
    { task_id: "d", profile_id: "bia" },
    { task_id: "e", profile_id: "bia" },
    { task_id: "a", profile_id: "bia" }, // tarefa compartilhada conta para as duas
    { task_id: "sumiu", profile_id: "ana" },
  ];
  it("conta abertas e atrasadas por pessoa", () => {
    const w = workloadByPerson(tasks, assignees, "2026-11-17");
    expect(w.get("ana")).toEqual({ open: 2, overdue: 1 });
    expect(w.get("bia")).toEqual({ open: 3, overdue: 1 });
    expect(w.has("caio")).toBe(false);
  });
  it("prazo de hoje ainda não é atraso", () => {
    expect(workloadByPerson([{ id: "x", status: "a_fazer", due: "2026-11-17" }], [{ task_id: "x", profile_id: "ana" }], "2026-11-17").get("ana")).toEqual({ open: 1, overdue: 0 });
  });
});
