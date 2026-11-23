import { describe, expect, it } from "vitest";
import { calendarEntries } from "@/lib/mural/calendar";
import {
  canEditRecording,
  canSetRecordingStatus,
  clientDeleteConfirmed,
  NO_FILTER,
  recordingInputProblem,
  recordingTime,
  splitRecordings,
  type Recording,
} from "@/lib/mural/model";

const rec = (o: Partial<Recording>): Recording => ({
  id: "g",
  title: "Captação",
  date: "2026-11-20",
  start: null,
  end: null,
  location: "",
  notes: "",
  status: "agendada",
  clientId: null,
  client: "",
  projectId: null,
  createdBy: "outra",
  createdAt: "",
  teamIds: [],
  ...o,
});
const ok = { title: "Captação do vídeo", date: "2026-11-20", start: "14:00", end: "16:30", location: "Estúdio", notes: "" };

describe("gravações · validação (espelho de private.check_recording)", () => {
  it("aceita dados completos e horários vazios", () => {
    expect(recordingInputProblem(ok)).toBeNull();
    expect(recordingInputProblem({ ...ok, start: "", end: "" })).toBeNull();
  });
  it("recusa título curto, data inválida e horário inválido", () => {
    expect(recordingInputProblem({ ...ok, title: " a " })).toMatch(/título/i);
    expect(recordingInputProblem({ ...ok, date: "2026-02-30" })).toMatch(/data/i);
    expect(recordingInputProblem({ ...ok, start: "25:00" })).toMatch(/início/i);
  });
  it("término sem início não vale", () => {
    expect(recordingInputProblem({ ...ok, start: "", end: "16:00" })).toMatch(/início/i);
  });
  it("término precisa ser depois do início", () => {
    expect(recordingInputProblem({ ...ok, start: "16:00", end: "16:00" })).toMatch(/término/i);
    expect(recordingInputProblem({ ...ok, start: "16:00", end: "15:00" })).toMatch(/término/i);
  });
  it("limites de local e observações", () => {
    expect(recordingInputProblem({ ...ok, location: "x".repeat(161) })).toMatch(/local/i);
    expect(recordingInputProblem({ ...ok, notes: "x".repeat(3001) })).toMatch(/observações/i);
  });
});

describe("gravações · permissões (espelho do banco)", () => {
  it("editar/excluir: quem agendou ou a administração", () => {
    expect(canEditRecording("colaborador", "me", rec({ createdBy: "me" }))).toBe(true);
    expect(canEditRecording("colaborador", "me", rec({ createdBy: "outra", teamIds: ["me"] }))).toBe(false);
    expect(canEditRecording("admin", "me", rec({ createdBy: "outra" }))).toBe(true);
  });
  it("status: também quem está na equipe da gravação", () => {
    expect(canSetRecordingStatus("colaborador", "me", rec({ teamIds: ["me"] }))).toBe(true);
    expect(canSetRecordingStatus("colaborador", "me", rec({ teamIds: ["outra"] }))).toBe(false);
  });
});

describe("gravações · ordem da aba e horário", () => {
  it("próximas por data e horário; o resto vai para o histórico, mais recente primeiro", () => {
    const list = [
      rec({ id: "amanha", date: "2026-11-19", start: "09:00" }),
      rec({ id: "hoje-tarde", date: "2026-11-18", start: "15:00" }),
      rec({ id: "hoje-cedo", date: "2026-11-18", start: "08:00" }),
      rec({ id: "hoje-sem-hora", date: "2026-11-18" }),
      rec({ id: "ontem", date: "2026-11-17" }),
      rec({ id: "realizada", date: "2026-11-18", status: "realizada" }),
      rec({ id: "cancelada", date: "2026-11-25", status: "cancelada" }),
    ];
    const { upcoming, past } = splitRecordings(list, "2026-11-18");
    expect(upcoming.map((r) => r.id)).toEqual(["hoje-cedo", "hoje-tarde", "hoje-sem-hora", "amanha"]);
    expect(past.map((r) => r.id)).toEqual(["cancelada", "realizada", "ontem"]);
  });
  it("texto do horário", () => {
    expect(recordingTime({ start: "14:00", end: "16:30" })).toBe("14:00–16:30");
    expect(recordingTime({ start: "14:00", end: null })).toBe("a partir das 14:00");
    expect(recordingTime({ start: null, end: null })).toBe("Horário a definir");
  });
});

describe("gravações no calendário", () => {
  const clients = [{ id: "c1", name: "Loja X" }];
  const base = { tasks: [], briefings: [], projects: [], clients };
  const recordings = [
    rec({ id: "g1", clientId: "c1", client: "Loja X", start: "15:00", teamIds: ["me"] }),
    rec({ id: "g2", start: "09:00" }),
    rec({ id: "g3", status: "cancelada" }),
    rec({ id: "g4", status: "realizada", projectId: "p1", clientId: "c1" }),
    rec({ id: "g5", client: "Cliente que saiu" }), // cliente apagado: só o nome em texto
  ];

  it("aparecem como 'gravacao', por horário, sem as canceladas", () => {
    const day = calendarEntries({ ...base, recordings }, NO_FILTER, "me").get("2026-11-20")!;
    expect(day.map((e) => e.id)).toEqual(["g2", "g1", "g4", "g5"]);
    expect(day.every((e) => e.kind === "gravacao")).toBe(true);
    expect(day.find((e) => e.id === "g1")).toMatchObject({ context: "Loja X", time: "15:00", done: false });
    expect(day.find((e) => e.id === "g4")?.done).toBe(true);
    expect(day.find((e) => e.id === "g5")?.context).toBe("Cliente que saiu");
  });

  it("respeitam os filtros de pessoa, cliente, projeto e busca", () => {
    const ids = (f: Partial<typeof NO_FILTER>) => (calendarEntries({ ...base, recordings }, { ...NO_FILTER, ...f }, "me").get("2026-11-20") ?? []).map((e) => e.id);
    expect(ids({ person: "minhas" })).toEqual(["g1"]);
    expect(ids({ client: "c1" })).toEqual(["g1", "g4"]);
    expect(ids({ project: "p1" })).toEqual(["g4"]);
    expect(ids({ q: "loja" })).toEqual(["g1", "g4"]);
  });
});

describe("apagar cliente · confirmação pelo nome (mesma regra do banco)", () => {
  it("aceita o nome sem diferenciar maiúsculas e espaços nas pontas", () => {
    expect(clientDeleteConfirmed("Loja X", "  loja x ")).toBe(true);
  });
  it("recusa nome diferente ou vazio", () => {
    expect(clientDeleteConfirmed("Loja X", "Loja")).toBe(false);
    expect(clientDeleteConfirmed("Loja X", "")).toBe(false);
  });
});
