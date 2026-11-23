/**
 * Notificações no celular — regras no banco, com o COLABORADOR de teste.
 * Exige a migration 20261117190000_notificacoes_push aplicada. Usa um endpoint FICTÍCIO (nada é enviado).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const endpoint = `https://fcm.googleapis.com/fcm/send/teste-automatico-${Date.now().toString(36)}`;
const p256dh = "B".repeat(87);
const authKey = "a".repeat(22);

describe.skipIf(!enabled)("Notificações (push) — colaborador", () => {
  let db: SupabaseClient;
  let me: string;

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw new Error("Falha ao entrar com o usuário de teste.");
    me = data.user!.id;
  });

  afterAll(async () => {
    await db?.rpc("push_unsubscribe", { p_endpoint: endpoint });
    await db?.auth.signOut();
  });

  it("recusa endereço que não é de um serviço de push (anti-SSRF)", async () => {
    for (const bad of ["https://evil.example.com/x", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.com/x"]) {
      const { error } = await db.rpc("push_subscribe", { p_endpoint: bad, p_p256dh: p256dh, p_auth: authKey, p_user_agent: "teste" });
      expect(error, bad).not.toBeNull();
    }
  });

  it("inscreve o próprio aparelho; vê só os seus e nunca as chaves", async () => {
    const { error } = await db.rpc("push_subscribe", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: authKey, p_user_agent: "teste" });
    expect(error).toBeNull();
    const mine = await db.from("push_subscriptions").select("endpoint");
    expect(mine.data?.map((r) => r.endpoint)).toContain(endpoint);
    const keys = await db.from("push_subscriptions").select("p256dh, auth");
    expect(keys.error).not.toBeNull(); // colunas das chaves não são legíveis pela API
  });

  it("membro não busca aparelhos de outras pessoas nem apaga inscrições alheias", async () => {
    const targets = await db.rpc("push_targets", { p_profiles: [me] });
    expect(targets.error).not.toBeNull();
    const drop = await db.rpc("push_drop", { p_endpoint: endpoint });
    expect(drop.error).not.toBeNull();
    const direct = await db.from("push_subscriptions").insert({ profile_id: me, endpoint: `${endpoint}-x`, p256dh, auth: authKey });
    expect(direct.error).not.toBeNull();
  });

  it("desinscreve", async () => {
    expect((await db.rpc("push_unsubscribe", { p_endpoint: endpoint })).error).toBeNull();
    const mine = await db.from("push_subscriptions").select("endpoint").eq("endpoint", endpoint);
    expect(mine.data).toHaveLength(0);
  });

  it("sem login, nada funciona", async () => {
    const anon = createClient(url!, key!, opts);
    const { error } = await anon.rpc("push_subscribe", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: authKey, p_user_agent: "" });
    expect(error).not.toBeNull();
  });
});
