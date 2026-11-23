import { describe, expect, it } from "vitest";
import { canDeleteProject, canManageClients, clientName, clientProblem, matchesFilter, matchesSearch, NO_FILTER, projectProblem, searchKey } from "@/lib/mural/model";

const ME = "me";
const A = "cliente-a";
const P = "projeto-1";

describe("clientes e projetos", () => {
  it("só a administração cadastra", () => {
    expect(canManageClients("principal")).toBe(true);
    expect(canManageClients("admin")).toBe(true);
    expect(canManageClients("colaborador")).toBe(false);
  });

  it("validação de cliente", () => {
    expect(clientProblem("Café Aurora", "")).toBeNull();
    expect(clientProblem("C", "")).toMatch(/nome/i);
    expect(clientProblem("x".repeat(81), "")).toMatch(/80/);
    expect(clientProblem("Café Aurora", "x".repeat(2001))).toMatch(/2\.000/);
  });

  it("validação de projeto", () => {
    expect(projectProblem("Lançamento de verão", "", "2026-12-20")).toBeNull();
    expect(projectProblem("L", "", null)).toMatch(/nome/i);
    expect(projectProblem("Lançamento", "", "2026-02-31")).toMatch(/prazo/i);
  });

  it("nome exibido: cadastro > texto antigo > Interno", () => {
    const clients = [{ id: A, name: "Café Aurora" }];
    expect(clientName({ clientId: A, client: "antigo" }, clients)).toBe("Café Aurora");
    expect(clientName({ clientId: null, client: "Texto antigo" }, clients)).toBe("Texto antigo");
    expect(clientName({ clientId: null, client: "" }, clients)).toBe("Interno");
  });
});

describe("filtros do quadro", () => {
  const t = (clientId: string | null, projectId: string | null, assigneeIds: string[]) => ({ clientId, projectId, assigneeIds });

  it("sem filtro: tudo", () => {
    expect(matchesFilter(t(null, null, []), NO_FILTER, ME)).toBe(true);
  });
  it("por cliente, interno e projeto", () => {
    expect(matchesFilter(t(A, null, []), { ...NO_FILTER, client: A }, ME)).toBe(true);
    expect(matchesFilter(t("outro", null, []), { ...NO_FILTER, client: A }, ME)).toBe(false);
    expect(matchesFilter(t(null, null, []), { ...NO_FILTER, client: "interno" }, ME)).toBe(true);
    expect(matchesFilter(t(A, null, []), { ...NO_FILTER, client: "interno" }, ME)).toBe(false);
    expect(matchesFilter(t(A, P, []), { ...NO_FILTER, client: A, project: P }, ME)).toBe(true);
    expect(matchesFilter(t(A, null, []), { ...NO_FILTER, client: A, project: P }, ME)).toBe(false);
  });
  it("por pessoa: minhas e de alguém", () => {
    expect(matchesFilter(t(null, null, [ME]), { ...NO_FILTER, person: "minhas" }, ME)).toBe(true);
    expect(matchesFilter(t(null, null, ["outra"]), { ...NO_FILTER, person: "minhas" }, ME)).toBe(false);
    expect(matchesFilter(t(null, null, ["outra"]), { ...NO_FILTER, person: "outra" }, ME)).toBe(true);
  });
});

describe("busca no mural", () => {
  const task = { clientId: null, projectId: null, assigneeIds: [], title: "Roteiro do Vídeo institucional", client: "Zona Fit", brief: "Gravação na academia" };
  it("ignora acentos, maiúsculas e ordem das palavras; procura em título, cliente e descrição", () => {
    expect(searchKey("  VÍDEO   Institucional ")).toBe("video institucional");
    expect(matchesFilter(task, { ...NO_FILTER, q: "video" }, ME)).toBe(true);
    expect(matchesFilter(task, { ...NO_FILTER, q: "institucional roteiro" }, ME)).toBe(true);
    expect(matchesFilter(task, { ...NO_FILTER, q: "zona" }, ME)).toBe(true);
    expect(matchesFilter(task, { ...NO_FILTER, q: "academia" }, ME)).toBe(true);
    expect(matchesFilter(task, { ...NO_FILTER, q: "video foto" }, ME)).toBe(false);
    expect(matchesFilter(task, { ...NO_FILTER, q: "   " }, ME)).toBe(true);
  });
  it("busca vazia não esconde nada", () => {
    expect(matchesSearch(["qualquer"], "")).toBe(true);
    expect(matchesSearch([null, undefined], "x")).toBe(false);
  });
});

describe("apagar projeto (espelho de project_delete)", () => {
  it("só a administração, e só projeto concluído", () => {
    expect(canDeleteProject("admin", { status: "concluido" })).toBe(true);
    expect(canDeleteProject("principal", { status: "concluido" })).toBe(true);
    expect(canDeleteProject("admin", { status: "ativo" })).toBe(false);
    expect(canDeleteProject("admin", { status: "pausado" })).toBe(false);
    expect(canDeleteProject("colaborador", { status: "concluido" })).toBe(false);
  });
});
