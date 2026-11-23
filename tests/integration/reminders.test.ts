/**
 * Lembrete de prazos — permissões no banco, com o COLABORADOR de teste.
 * Exige as migrations 20261118090000_lembrete_prazos e 20261120090000_lembrete_gravacoes aplicadas.
 * Só o servidor (service_role) usa reminders_claim / agenda_claim.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!enabled)("Lembrete de prazos — colaborador", () => {
  let db: SupabaseClient;

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("Falha ao entrar com o usuário de teste.");
  });

  afterAll(async () => {
    await db?.auth.signOut();
  });

  it("membro não dispara lembretes nem lê o registro", async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await db.rpc("reminders_claim", { p_today: today, p_until: today })).error).not.toBeNull();
    expect((await db.rpc("agenda_claim", { p_today: today, p_until: today })).error).not.toBeNull();
    expect((await db.from("reminder_log").select("day")).error).not.toBeNull();
  });

  it("sem login, também não", async () => {
    const anon = createClient(url!, key!, opts);
    const today = new Date().toISOString().slice(0, 10);
    expect((await anon.rpc("reminders_claim", { p_today: today, p_until: today })).error).not.toBeNull();
    expect((await anon.rpc("agenda_claim", { p_today: today, p_until: today })).error).not.toBeNull();
  });
});
