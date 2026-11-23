import { describe, expect, it } from "vitest";
import { addDays, buildReminders, reminderUntil, splitAgenda, todayInBrasilia, weekday, type RecordingRow } from "@/lib/push/reminders";

// 2026-11-17 é uma terça; 2026-11-20 é uma sexta
describe("datas", () => {
  it("addDays e weekday", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekday("2026-11-17")).toBe(2);
  });
  it("janela: amanhã; na sexta, até segunda", () => {
    expect(reminderUntil("2026-11-17")).toBe("2026-11-18");
    expect(reminderUntil("2026-11-20")).toBe("2026-11-23");
  });
  it("hoje em Brasília (11h UTC = 8h BRT)", () => {
    expect(todayInBrasilia(new Date("2026-11-17T11:00:00Z"))).toBe("2026-11-17");
    expect(todayInBrasilia(new Date("2026-11-18T02:00:00Z"))).toBe("2026-11-17");
  });
});

describe("buildReminders", () => {
  const today = "2026-11-17";
  it("uma tarefa: frase direta", () => {
    const m = buildReminders([{ profile_id: "ana", task_title: "Post", due: today }], today);
    expect(m.get("ana")).toEqual({ title: "Prazos de hoje", body: "Vence hoje: Post", url: "/tarefas?view=calendario", tag: "lembrete-prazos" });
    expect(buildReminders([{ profile_id: "ana", task_title: "Post", due: "2026-11-18" }], today).get("ana")?.body).toBe("Vence amanhã: Post");
    expect(buildReminders([{ profile_id: "ana", task_title: "Post", due: "2026-11-10" }], today).get("ana")?.body).toBe("Atrasada: Post");
  });
  it("várias: resumo e a mais urgente primeiro; uma mensagem por pessoa", () => {
    const m = buildReminders(
      [
        { profile_id: "ana", task_title: "Vídeo", due: "2026-11-18" },
        { profile_id: "ana", task_title: "Fotos", due: "2026-11-15" },
        { profile_id: "ana", task_title: "Post", due: today },
        { profile_id: "bia", task_title: "Logo", due: today },
      ],
      today,
    );
    expect(m.size).toBe(2);
    expect(m.get("ana")?.body).toBe("3 tarefas no prazo: 1 atrasada, 1 para hoje, 1 para amanhã. Comece por: Fotos");
    expect(m.get("bia")?.body).toBe("Vence hoje: Logo");
  });
  it("sexta: o que vence segunda aparece pelo nome do dia", () => {
    expect(buildReminders([{ profile_id: "ana", task_title: "Post", due: "2026-11-23" }], "2026-11-20").get("ana")?.body).toBe("Vence segunda: Post");
  });
});

describe("buildReminders · gravações", () => {
  const today = "2026-11-17";
  const rec = (o: Partial<RecordingRow>): RecordingRow => ({ profile_id: "ana", title: "Captação Loja X", date: today, start: "14:00:00", ...o });

  it("só gravação: frase com o horário e link para a aba", () => {
    expect(buildReminders([], today, [rec({})]).get("ana")).toEqual({
      title: "Agenda de hoje",
      body: "Gravação hoje às 14:00: Captação Loja X",
      url: "/gravacoes",
      tag: "lembrete-prazos",
    });
    expect(buildReminders([], today, [rec({ date: "2026-11-18", start: null })]).get("ana")?.body).toBe("Gravação amanhã: Captação Loja X");
    expect(buildReminders([], "2026-11-20", [rec({ date: "2026-11-23", start: "09:30" })]).get("ana")?.body).toBe("Gravação segunda às 09:30: Captação Loja X");
  });

  it("várias gravações: a mais cedo primeiro (sem horário fica para o fim do dia)", () => {
    const m = buildReminders([], today, [
      rec({ title: "Sem hora", start: null }),
      rec({ title: "Tarde", start: "15:00:00" }),
      rec({ title: "Cedo", start: "08:00:00" }),
    ]);
    expect(m.get("ana")?.body).toBe("3 gravações. A primeira: hoje às 08:00, Cedo");
  });

  it("gravação + prazos: as duas linhas na mesma mensagem, com link para o calendário", () => {
    const m = buildReminders([{ profile_id: "ana", task_title: "Post", due: today }], today, [rec({})]);
    expect(m.get("ana")).toMatchObject({
      title: "Agenda de hoje",
      body: "Gravação hoje às 14:00: Captação Loja X\nVence hoje: Post",
      url: "/tarefas?view=calendario",
    });
  });

  it("uma mensagem por pessoa; quem só tem prazo continua recebendo a mensagem de antes", () => {
    const m = buildReminders([{ profile_id: "bia", task_title: "Logo", due: today }], today, [rec({}), rec({ profile_id: "caio" })]);
    expect(m.size).toBe(3);
    expect(m.get("bia")?.title).toBe("Prazos de hoje");
    expect(m.get("caio")?.body).toBe("Gravação hoje às 14:00: Captação Loja X");
  });

  it("splitAgenda separa as linhas do banco", () => {
    const { tasks, recordings } = splitAgenda([
      { profile_id: "ana", kind: "tarefa", title: "Post", day: today, start_time: null },
      { profile_id: "ana", kind: "gravacao", title: "Captação", day: today, start_time: "10:00:00" },
    ]);
    expect(tasks).toEqual([{ profile_id: "ana", task_title: "Post", due: today }]);
    expect(recordings).toEqual([{ profile_id: "ana", title: "Captação", date: today, start: "10:00:00" }]);
  });
});
