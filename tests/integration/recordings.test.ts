/**
 * GRAVAÇÕES e APAGAR CLIENTES — regras no banco, com o COLABORADOR de teste (chave publicável).
 * Exige as migrations 20261119120000_gravacoes e 20261119130000_apagar_clientes aplicadas.
 * Tudo o que o teste cria é apagado no fim. Comando: npm run test:db
 *
 * Segurança: o teste de "apagar cliente" usa um id INEXISTENTE — nunca encosta em clientes reais,
 * mesmo que a conta de teste fosse administradora por engano.
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

describe.skipIf(!enabled)("Gravações — colaborador", () => {
  let db: SupabaseClient;
  let me: string;
  let recId: string;

  const args = (extra: Record<string, unknown> = {}) => ({
    p_title: "E2E Teste automático — gravação",
    p_date: "2030-01-15",
    p_start: "14:00",
    p_end: "16:00",
    p_location: "Estúdio de teste",
    p_notes: "",
    p_client: null,
    p_project: null,
    p_team: [],
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
    if (recId) await db.rpc("recording_delete", { p_recording: recId });
    await db.auth.signOut();
  });

  it("visitante sem login não lê nem agenda", async () => {
    const anon = createClient(url!, key!, opts);
    for (const t of ["recordings", "recording_team"]) expect((await anon.from(t).select("*").limit(1)).data ?? []).toHaveLength(0);
    expect((await anon.rpc("recording_create", args())).error).not.toBeNull();
  });

  it("NÃO grava direto na tabela (só pela função)", async () => {
    expect((await db.from("recordings").insert({ title: "burlar", scheduled_date: "2030-01-01", created_by: me })).error).not.toBeNull();
  });

  it("agenda uma gravação; sem equipe informada, quem agendou entra na equipe", async () => {
    const r = await db.rpc("recording_create", args());
    expect(r.error).toBeNull();
    recId = r.data as string;
    const row = await db.from("recordings").select("title, status, start_time, end_time, created_by").eq("id", recId).single();
    expect(row.data).toMatchObject({ status: "agendada", created_by: me, start_time: "14:00:00", end_time: "16:00:00" });
    const team = await db.from("recording_team").select("profile_id").eq("recording_id", recId);
    expect((team.data ?? []).map((t) => t.profile_id)).toEqual([me]);
  });

  it("recusa término antes do início, pessoa inexistente e projeto inexistente", async () => {
    expect((await db.rpc("recording_create", args({ p_start: "16:00", p_end: "15:00" }))).error).not.toBeNull();
    expect((await db.rpc("recording_create", args({ p_start: null, p_end: "15:00" }))).error).not.toBeNull();
    expect((await db.rpc("recording_create", args({ p_team: [SOMEONE] }))).error).not.toBeNull();
    expect((await db.rpc("recording_create", args({ p_project: SOMEONE }))).error).not.toBeNull();
  });

  it("quem agendou edita e muda o status", async () => {
    expect((await db.rpc("recording_update", { p_recording: recId, ...args({ p_title: "E2E Teste automático — gravação editada", p_location: "Outro local" }) })).error).toBeNull();
    expect((await db.rpc("recording_set_status", { p_recording: recId, p_status: "realizada" })).error).toBeNull();
    expect((await db.from("recordings").select("status, location").eq("id", recId).single()).data).toMatchObject({ status: "realizada", location: "Outro local" });
    expect((await db.rpc("recording_set_status", { p_recording: recId, p_status: "agendada" })).error).toBeNull();
  });

  it("equipe registra quem colocou e quando; editar sem mudar a equipe mantém o registro", async () => {
    const first = await db.from("recording_team").select("added_by, added_at").eq("recording_id", recId).eq("profile_id", me).single();
    expect(first.data?.added_by).toBe(me);
    expect((await db.rpc("recording_update", { p_recording: recId, ...args({ p_team: [me] }) })).error).toBeNull();
    const again = await db.from("recording_team").select("added_by, added_at").eq("recording_id", recId).eq("profile_id", me).single();
    expect(again.data?.added_at).toBe(first.data?.added_at);
  });

  it("NÃO grava direto na equipe (só pelas funções)", async () => {
    expect((await db.from("recording_team").insert({ recording_id: recId, profile_id: me, added_by: SOMEONE })).error).not.toBeNull();
    await db.from("recording_team").update({ added_by: SOMEONE }).eq("recording_id", recId); // sem permissão de UPDATE
    expect((await db.from("recording_team").select("added_by").eq("recording_id", recId).single()).data?.added_by).toBe(me);
  });

  it("colaborador NÃO apaga projeto (o banco confere antes de procurar o projeto)", async () => {
    const r = await db.rpc("project_delete", { p_project: SOMEONE });
    expect(r.error?.message).toMatch(/administra/i);
  });

  it("colaborador NÃO apaga cliente (e o banco confere antes de procurar o cliente)", async () => {
    const r = await db.rpc("client_delete", { p_client: SOMEONE, p_confirm: "qualquer" });
    expect(r.error?.message).toMatch(/administra/i);
  });
});
