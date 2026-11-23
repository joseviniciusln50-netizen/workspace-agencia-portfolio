/**
 * Avisos (sininho) — regras no banco, com o COLABORADOR de teste.
 * Exige a migration 20261117150000_avisos aplicada.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!enabled)("Avisos — colaborador", () => {
  let db: SupabaseClient;
  let me: string;

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("Falha ao entrar com o usuário de teste.");
    me = data.user!.id;
  });

  afterAll(async () => {
    await db?.auth.signOut();
  });

  it("marcar como visto grava a hora e só a própria linha é legível", async () => {
    const before = Date.now();
    const { data, error } = await db.rpc("notifications_mark_seen");
    expect(error).toBeNull();
    expect(Date.parse(data as string)).toBeGreaterThan(before - 60_000);

    const rows = await db.from("notification_state").select("profile_id, seen_at");
    expect(rows.error).toBeNull();
    expect(rows.data!.map((r) => r.profile_id)).toEqual([me]); // RLS: nenhuma linha de outra pessoa
  });

  it("não dá para gravar a tabela diretamente (só pela função)", async () => {
    const ins = await db.from("notification_state").upsert({ profile_id: me, seen_at: "2000-01-01T00:00:00Z" });
    expect(ins.error).not.toBeNull();
    const upd = await db.from("notification_state").update({ seen_at: "2000-01-01T00:00:00Z" }).eq("profile_id", me).select();
    expect(upd.data ?? []).toHaveLength(0);
  });

  it("sem login, a função recusa", async () => {
    const anon = createClient(url!, key!, opts);
    const { error } = await anon.rpc("notifications_mark_seen");
    expect(error).not.toBeNull();
  });
});
