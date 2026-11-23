/**
 * Comentários e links (anexos) — regras no banco, com o COLABORADOR de teste.
 * Exige a migration 20261116180000_comentarios_links aplicada. Tudo é apagado no fim (a tarefa leva junto).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!enabled)("Comentários e links — colaborador", () => {
  let db: SupabaseClient;
  let me: string;
  let taskId: string;
  let commentId: string;

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("Falha ao entrar com o usuário de teste.");
    me = data.user.id;
    const t = await db.rpc("task_create", {
      p_title: "Teste automático — comentários",
      p_client: "Teste",
      p_brief: "",
      p_priority: "media",
      p_due: null,
      p_assignees: [],
      p_checklist: [],
      p_briefing: null,
    });
    if (t.error) throw new Error(`Não foi possível criar a tarefa de teste: ${t.error.message}`);
    taskId = t.data as string;
  });

  afterAll(async () => {
    if (db && taskId) await db.rpc("task_delete", { p_task: taskId });
    await db?.auth.signOut();
  });

  it("comenta, edita o próprio comentário e o histórico registra", async () => {
    const c = await db.rpc("comment_add", { p_task: taskId, p_body: "Primeira versão enviada." });
    expect(c.error).toBeNull();
    commentId = c.data as string;
    expect((await db.rpc("comment_edit", { p_comment: commentId, p_body: "Versão 2 enviada." })).error).toBeNull();
    const row = await db.from("task_comments").select("body, author_id, edited_at").eq("id", commentId).single();
    expect(row.data).toMatchObject({ body: "Versão 2 enviada.", author_id: me });
    expect(row.data?.edited_at).not.toBeNull();
    const ev = await db.from("task_events").select("kind").eq("task_id", taskId);
    expect((ev.data ?? []).map((e) => e.kind)).toContain("comentario");
  });

  it("recusa comentário vazio e gravação direta na tabela", async () => {
    expect((await db.rpc("comment_add", { p_task: taskId, p_body: "   " })).error).not.toBeNull();
    expect((await db.from("task_comments").insert({ task_id: taskId, author_id: me, body: "burlar" })).error).not.toBeNull();
    expect((await db.from("task_comments").update({ body: "burlar" }).eq("id", commentId).select("id")).data ?? []).toHaveLength(0);
  });

  it("adiciona link http(s) e o banco RECUSA javascript:, data: e file:", async () => {
    expect((await db.rpc("link_add", { p_task: taskId, p_url: "https://drive.google.com/drive/folders/teste", p_title: "Pasta" })).error).toBeNull();
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "file:///C:/x", "ftp://host/arquivo"]) {
      expect((await db.rpc("link_add", { p_task: taskId, p_url: bad, p_title: "" })).error, bad).not.toBeNull();
    }
    const links = await db.from("task_links").select("url").eq("task_id", taskId);
    expect((links.data ?? []).map((l) => l.url)).toEqual(["https://drive.google.com/drive/folders/teste"]);
  });

  it("visitante sem login não lê comentários nem links", async () => {
    const anon = createClient(url!, key!, opts);
    expect((await anon.from("task_comments").select("id")).data ?? []).toHaveLength(0);
    expect((await anon.from("task_links").select("id")).data ?? []).toHaveLength(0);
    expect((await anon.rpc("comment_add", { p_task: taskId, p_body: "x" })).error).not.toBeNull();
  });

  it("apaga o próprio comentário e remove o próprio link", async () => {
    expect((await db.rpc("comment_delete", { p_comment: commentId })).error).toBeNull();
    const l = await db.from("task_links").select("id").eq("task_id", taskId).single();
    expect((await db.rpc("link_remove", { p_link: l.data!.id })).error).toBeNull();
  });
});
