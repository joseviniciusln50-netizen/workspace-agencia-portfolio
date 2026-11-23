import { describe, expect, it } from "vitest";
import type { RawEvent, TaskRef } from "@/lib/mural/notifications";
import { isAllowedEndpoint, pushRecipients, recordingPushRecipients } from "@/lib/push/rules";

describe("isAllowedEndpoint (anti-SSRF: só serviços de push conhecidos, https)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QH1abc",
    "https://wns2-bl2p.notify.windows.com/w/?token=abc",
  ])("aceita %s", (u) => expect(isAllowedEndpoint(u)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.com/x",
    "https://evilfcm.googleapis.com.attacker.net/x",
    "https://localhost/x",
    "https://169.254.169.254/latest",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "javascript:alert(1)",
    "não é url",
  ])("recusa %s", (u) => expect(isAllowedEndpoint(u)).toBe(false));
});

const task: TaskRef = { id: "t1", title: "Post de lançamento", createdBy: "chefe", assigneeIds: ["ana", "bia"] };
const ev = (o: Partial<RawEvent>): RawEvent => ({ id: 1, taskId: "t1", actorId: "ana", kind: "comentario", details: null, createdAt: "2026-11-17T10:00:00Z", ...o });

describe("pushRecipients", () => {
  it("comentário de Ana avisa os outros responsáveis e quem criou — nunca a própria Ana", () => {
    const r = pushRecipients([ev({})], task, "ana", "Ana");
    expect([...r.keys()].sort()).toEqual(["bia", "chefe"]);
    expect(r.get("bia")).toEqual({ title: "Workspace", body: "Ana comentou em Post de lançamento", url: "/tarefas?tarefa=t1", tag: "tarefa-t1" });
  });

  it("quem foi retirado da tarefa também é avisado (mesmo sem ser mais responsável)", () => {
    const r = pushRecipients([ev({ actorId: "chefe", kind: "responsaveis", details: { antes: ["ana", "caio"], depois: ["ana", "bia"] } })], task, "chefe", "Chefe");
    expect(r.get("caio")?.body).toBe("Chefe retirou você de Post de lançamento");
    expect(r.get("bia")?.body).toBe("Chefe atribuiu a você Post de lançamento");
    expect(r.has("ana")).toBe(false); // continuou: não é novidade para ela
  });

  it("ignora eventos de outras pessoas ou de outras tarefas e checklist", () => {
    expect(pushRecipients([ev({ actorId: "bia" }), ev({ taskId: "t2" }), ev({ kind: "checklist" })], task, "ana", "Ana").size).toBe(0);
  });

  it("várias ações seguidas: uma notificação por pessoa, com a mais recente", () => {
    const r = pushRecipients(
      [ev({ id: 1, kind: "status", details: { para: "em_producao" }, createdAt: "2026-11-17T10:00:00Z" }), ev({ id: 2, createdAt: "2026-11-17T10:00:01Z" })],
      task,
      "ana",
      "Ana",
    );
    expect(r.get("chefe")?.body).toBe("Ana comentou em Post de lançamento");
  });
});

describe("recordingPushRecipients", () => {
  const rec = { id: "g1", title: "Captação Loja X" };
  it("avisa só quem ENTROU na equipe, nunca quem fez a ação", () => {
    const m = recordingPushRecipients(rec, ["ana"], ["ana", "bia", "eu"], "eu", "Duda");
    expect([...m.keys()]).toEqual(["bia"]);
    expect(m.get("bia")).toEqual({ title: "Workspace", body: "Duda colocou você na gravação Captação Loja X", url: "/gravacoes?g=g1", tag: "gravacao-g1" });
  });
  it("editar sem mudar a equipe não avisa ninguém", () => {
    expect(recordingPushRecipients(rec, ["ana", "bia"], ["bia", "ana"], "eu", "Duda").size).toBe(0);
  });
});
