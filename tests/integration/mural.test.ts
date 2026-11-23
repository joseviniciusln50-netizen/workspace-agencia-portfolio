/**
 * MURAL REAL — regras no banco, com o COLABORADOR de teste (chave publicável, como um navegador).
 * Exige a migration 20261116120000_mural_real aplicada. Tudo o que o teste cria é apagado no fim.
 * Comando: npm run test:db
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const SOMEONE = "00000000-0000-4000-8000-000000000001";

describe.skipIf(!enabled)("Mural — colaborador", () => {
  let db: SupabaseClient;
  let me: string;
  let taskId: string;
  let briefingId: string;
  let fromBriefing: string;
  let noteId: string;

  const task = (extra: Record<string, unknown> = {}) => ({
    p_title: "Teste automático — tarefa",
    p_client: "Teste",
    p_brief: "",
    p_priority: "media",
    p_due: null,
    p_assignees: [],
    p_checklist: ["Primeiro item"],
    p_briefing: null,
    ...extra,
  });

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("Falha ao entrar com o usuário de teste.");
    me = data.user.id;
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of [taskId, fromBriefing]) if (id) await db.rpc("task_delete", { p_task: id });
    if (briefingId) await db.rpc("briefing_delete", { p_briefing: briefingId });
    if (noteId) await db.rpc("note_delete", { p_note: noteId });
    await db.auth.signOut();
  });

  it("visitante sem login não lê nada do mural", async () => {
    const anon = createClient(url!, key!, opts);
    for (const t of ["tasks", "notes", "briefings", "checklist_items", "task_assignees", "task_events"]) {
      const r = await anon.from(t).select("*").limit(1);
      expect(r.data ?? []).toHaveLength(0);
    }
    expect((await anon.rpc("task_create", task())).error).not.toBeNull();
  });

  it("cria tarefa para SI (sem escolher responsável → ele mesmo)", async () => {
    const { data, error } = await db.rpc("task_create", task());
    expect(error).toBeNull();
    taskId = data as string;
    const a = await db.from("task_assignees").select("profile_id").eq("task_id", taskId);
    expect(a.data?.map((r) => r.profile_id)).toEqual([me]);
  });

  // Todos atribuem (migration todos_atribuem). O teste não atribui pessoas reais (evita avisos para a equipe):
  // confere que a trava agora é só "perfil ativo", com um id que não existe.
  it("NÃO atribui a perfil inexistente ou desativado", async () => {
    const r = await db.rpc("task_create", task({ p_assignees: [SOMEONE] }));
    expect(r.error).not.toBeNull();
    const r2 = await db.rpc("task_create", task({ p_assignees: [me, SOMEONE] }));
    expect(r2.error).not.toBeNull();
  });

  it("NÃO grava direto nas tabelas (só pelas funções)", async () => {
    expect((await db.from("tasks").insert({ title: "burlar", created_by: me })).error).not.toBeNull();
    expect((await db.from("tasks").update({ status: "aprovado" }).eq("id", taskId).select("id")).data ?? []).toHaveLength(0);
    expect((await db.from("task_assignees").insert({ task_id: taskId, profile_id: SOMEONE })).error).not.toBeNull();
  });

  it("responsável move a própria tarefa por todas as etapas, inclusive aprovar e entregar", async () => {
    for (const st of ["em_producao", "em_revisao", "ajustes", "aprovado", "entregue", "em_revisao"]) {
      expect((await db.rpc("task_set_status", { p_task: taskId, p_status: st })).error).toBeNull();
    }
    const t = await db.from("tasks").select("status").eq("id", taskId).single();
    expect(t.data?.status).toBe("em_revisao");
  });

  it("altera responsáveis (todo mundo atribui), mas nunca deixa a tarefa sem ninguém", async () => {
    expect((await db.rpc("task_set_assignees", { p_task: taskId, p_assignees: [me] })).error).toBeNull();
    expect((await db.rpc("task_set_assignees", { p_task: taskId, p_assignees: [] })).error).not.toBeNull();
    expect((await db.rpc("task_set_assignees", { p_task: taskId, p_assignees: [me, SOMEONE] })).error).not.toBeNull();
    const a = await db.from("task_assignees").select("profile_id").eq("task_id", taskId);
    expect(a.data?.map((r) => r.profile_id)).toEqual([me]);
  });

  // Cobrança (task_nudge): o teste não cobra pessoas reais; confere as travas.
  it("cobrar: só tarefa atrasada e com outro responsável além de quem cobra", async () => {
    const semPrazo = await db.rpc("task_nudge", { p_task: taskId, p_message: "" });
    expect(semPrazo.error?.message).toMatch(/atrasadas/);
    const { data, error } = await db.rpc("task_create", task({ p_due: "2026-01-02", p_checklist: [] }));
    expect(error).toBeNull();
    const atrasada = data as string;
    try {
      const so = await db.rpc("task_nudge", { p_task: atrasada, p_message: "E2E" });
      expect(so.error?.message).toMatch(/outro responsável/); // só eu sou responsável
      const ev = await db.from("task_events").select("id").eq("task_id", atrasada).eq("kind", "cobranca");
      expect(ev.data ?? []).toHaveLength(0);
    } finally {
      await db.rpc("task_delete", { p_task: atrasada });
    }
  });

  it("checklist: adiciona e marca (sem aprovar a tarefa)", async () => {
    const add = await db.rpc("checklist_add", { p_task: taskId, p_label: "Segundo item" });
    expect(add.error).toBeNull();
    const items = await db.from("checklist_items").select("id").eq("task_id", taskId);
    for (const i of items.data ?? []) expect((await db.rpc("checklist_toggle", { p_item: i.id, p_done: true })).error).toBeNull();
    const t = await db.from("tasks").select("status").eq("id", taskId).single();
    expect(t.data?.status).toBe("em_revisao"); // checklist 100% NÃO aprova
  });

  it("edita a própria tarefa e o histórico registra", async () => {
    expect(
      (await db.rpc("task_update", { p_task: taskId, p_title: "Teste automático — editada", p_client: "Teste", p_brief: "x", p_priority: "alta", p_due: "2026-12-31" })).error,
    ).toBeNull();
    const ev = await db.from("task_events").select("kind").eq("task_id", taskId);
    const kinds = (ev.data ?? []).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["criada", "status", "checklist", "editada"]));
  });

  it("post-it: cria e remove o próprio", async () => {
    const r = await db.rpc("note_create", { p_text: "Teste automático — recado", p_color: "red" });
    expect(r.error).toBeNull();
    noteId = r.data as string;
    expect((await db.rpc("note_create", { p_text: "x", p_color: "verde" })).error).not.toBeNull();
  });

  it("briefing: registra e gera tarefa a partir dele; excluir o briefing mantém a tarefa", async () => {
    const b = await db.rpc("briefing_create", {
      p_title: "Teste automático — reunião",
      p_client: "Teste",
      p_date: "2026-11-16",
      p_notes: "anotações",
      p_decisions: "decisão",
      p_participants: [me],
    });
    expect(b.error).toBeNull();
    briefingId = b.data as string;

    const t = await db.rpc("task_create", task({ p_title: "Teste automático — do briefing", p_briefing: briefingId }));
    expect(t.error).toBeNull();
    fromBriefing = t.data as string;

    expect((await db.rpc("briefing_delete", { p_briefing: briefingId })).error).toBeNull();
    briefingId = "";
    const after = await db.from("tasks").select("briefing_id").eq("id", fromBriefing).single();
    expect(after.data?.briefing_id).toBeNull();
  });
});
