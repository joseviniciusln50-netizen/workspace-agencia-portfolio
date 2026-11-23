/**
 * Clientes e projetos — regras no banco, com o COLABORADOR de teste.
 * Exige a migration 20261117090000_clientes_projetos aplicada.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const NOPE = "00000000-0000-4000-8000-000000000001";

describe.skipIf(!enabled)("Clientes e projetos — colaborador", () => {
  let db: SupabaseClient;
  let taskId: string;

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("Falha ao entrar com o usuário de teste.");
    const t = await db.rpc("task_create", {
      p_title: "Teste automático — contexto",
      p_client: "",
      p_brief: "",
      p_priority: "media",
      p_due: null,
      p_assignees: [],
      p_checklist: [],
      p_briefing: null,
    });
    if (t.error) throw new Error(t.error.message);
    taskId = t.data as string;
  });

  afterAll(async () => {
    if (db && taskId) await db.rpc("task_delete", { p_task: taskId });
    await db?.auth.signOut();
  });

  it("lê clientes e projetos, mas NÃO cadastra nem edita (só a administração)", async () => {
    expect((await db.from("clients").select("id")).error).toBeNull();
    expect((await db.from("projects").select("id")).error).toBeNull();
    expect((await db.rpc("client_create", { p_name: "Teste automático — cliente", p_notes: "" })).error).not.toBeNull();
    expect((await db.rpc("client_update", { p_client: NOPE, p_name: "x y", p_notes: "", p_active: true })).error).not.toBeNull();
    expect((await db.rpc("project_create", { p_client: NOPE, p_name: "x y", p_description: "", p_due: null })).error).not.toBeNull();
    expect((await db.from("clients").insert({ name: "burlar", created_by: NOPE })).error).not.toBeNull();
  });

  it("liga a própria tarefa a 'Interno' e recusa cliente inexistente", async () => {
    expect((await db.rpc("task_set_context", { p_task: taskId, p_client: null, p_project: null })).error).toBeNull();
    expect((await db.rpc("task_set_context", { p_task: taskId, p_client: NOPE, p_project: null })).error).not.toBeNull();
    expect((await db.rpc("task_set_context", { p_task: taskId, p_client: null, p_project: NOPE })).error).not.toBeNull();
  });

  it("visitante sem login não lê clientes nem projetos", async () => {
    const anon = createClient(url!, key!, opts);
    expect((await anon.from("clients").select("id")).data ?? []).toHaveLength(0);
    expect((await anon.from("projects").select("id")).data ?? []).toHaveLength(0);
  });
});
