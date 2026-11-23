import { describe, expect, it } from "vitest";
import { buildNotices, buildRecordingNotices, mergeNotices, timeAgo, unreadCount, type RawEvent, type TaskRef, type TeamAddition } from "@/lib/mural/notifications";

const tasks: TaskRef[] = [
  { id: "minha", title: "Minha tarefa", createdBy: "chefe", assigneeIds: ["me"] },
  { id: "criei", title: "Que eu criei", createdBy: "me", assigneeIds: ["outra"] },
  { id: "alheia", title: "De outra pessoa", createdBy: "chefe", assigneeIds: ["outra"] },
];
let seq = 0;
const ev = (o: Partial<RawEvent>): RawEvent => ({ id: ++seq, taskId: "minha", actorId: "chefe", kind: "comentario", details: null, createdAt: `2026-11-17T10:${String(seq).padStart(2, "0")}:00Z`, ...o });

describe("buildNotices", () => {
  it("ações próprias e de tarefas alheias não viram aviso", () => {
    const n = buildNotices([ev({ actorId: "me" }), ev({ taskId: "alheia" }), ev({ actorId: null })], tasks, "me");
    expect(n).toHaveLength(0);
  });

  it("atribuição (na criação ou depois) e retirada", () => {
    const n = buildNotices(
      [
        ev({ kind: "criada", taskId: "alheia", details: { responsaveis: ["outra"] } }),
        ev({ kind: "criada", details: { responsaveis: ["me"] } }),
        ev({ kind: "responsaveis", taskId: "alheia", details: { antes: ["outra"], depois: ["outra", "me"] } }),
        ev({ kind: "responsaveis", taskId: "alheia", details: { antes: ["me"], depois: [] } }),
      ],
      tasks,
      "me",
    );
    expect(n.map((x) => x.text)).toEqual(["retirou você de", "atribuiu a você", "atribuiu a você"]); // mais novo primeiro
  });

  it("etapa, comentário, link e prazo nas minhas tarefas (inclusive as que criei); checklist não", () => {
    const n = buildNotices(
      [
        ev({ kind: "status", details: { de: "a_fazer", para: "em_revisao" } }),
        ev({ kind: "comentario", taskId: "criei", actorId: "outra" }),
        ev({ kind: "link" }),
        ev({ kind: "editada", details: { prazo_antes: "2026-11-20", prazo_depois: "2026-11-22" } }),
        ev({ kind: "editada", details: { prazo_antes: "2026-11-20", prazo_depois: "2026-11-20" } }),
        ev({ kind: "checklist", details: { feito: true } }),
      ],
      tasks,
      "me",
    );
    expect(n.map((x) => x.text).reverse()).toEqual(["moveu para “Em revisão”", "comentou em", "adicionou um link em", "mudou o prazo de"]);
  });

  it("limita a 30 e ignora tarefas que não existem mais", () => {
    const many = Array.from({ length: 40 }, () => ev({}));
    expect(buildNotices([...many, ev({ taskId: "sumiu" })], tasks, "me")).toHaveLength(30);
  });
});

describe("unreadCount / timeAgo", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const list = [{ createdAt: "2026-11-17T11:00:00Z" }, { createdAt: "2026-11-15T11:00:00Z" }, { createdAt: "2026-11-01T11:00:00Z" }];
  it("conta o que veio depois do 'visto'; sem registro, só os últimos 7 dias", () => {
    expect(unreadCount(list, "2026-11-16T00:00:00Z", now)).toBe(1);
    expect(unreadCount(list, null, now)).toBe(2);
  });
  it("tempo relativo", () => {
    expect(timeAgo("2026-11-17T11:59:40Z", now)).toBe("agora");
    expect(timeAgo("2026-11-17T11:15:00Z", now)).toBe("há 45 min");
    expect(timeAgo("2026-11-17T09:00:00Z", now)).toBe("há 3 h");
    expect(timeAgo("2026-11-16T10:00:00Z", now)).toBe("ontem");
    expect(timeAgo("2026-11-14T10:00:00Z", now)).toBe("há 3 dias");
  });
});

describe("avisos de gravação", () => {
  const add = (o: Partial<TeamAddition>): TeamAddition => ({ recordingId: "g1", title: "Captação", status: "agendada", addedBy: "chefe", addedAt: "2026-11-17T10:30:00Z", ...o });

  it("outra pessoa me colocou na equipe: aviso que abre a gravação", () => {
    expect(buildRecordingNotices([add({})], "me")).toEqual([
      { key: "g-g1", href: "/gravacoes?g=g1", title: "Captação", actorId: "chefe", text: "colocou você na gravação", createdAt: "2026-11-17T10:30:00Z" },
    ]);
  });

  it("eu mesmo me coloquei, quem colocou é desconhecido ou a gravação foi cancelada: sem aviso", () => {
    expect(buildRecordingNotices([add({ addedBy: "me" }), add({ addedBy: null }), add({ status: "cancelada" })], "me")).toHaveLength(0);
  });

  it("tarefas e gravações juntas: mais novo primeiro, chaves e links distintos, limite de 30", () => {
    const tasksN = buildNotices([ev({ createdAt: "2026-11-17T10:00:00Z" }), ev({ createdAt: "2026-11-17T11:00:00Z" })], tasks, "me");
    const merged = mergeNotices(tasksN, buildRecordingNotices([add({})], "me"));
    expect(merged.map((n) => n.href)).toEqual(["/tarefas?tarefa=minha", "/gravacoes?g=g1", "/tarefas?tarefa=minha"]);
    expect(new Set(merged.map((n) => n.key)).size).toBe(3);
    const many = Array.from({ length: 40 }, (_, i) => add({ recordingId: `g${i}` }));
    expect(mergeNotices(tasksN, buildRecordingNotices(many, "me"))).toHaveLength(30);
  });
});
