/*
 * Função AGENDADA da Netlify: lembrete de prazos e gravações no celular, dias úteis às 8h de Brasília (11h UTC).
 * - Só roda na versão publicada (não em testes). Não pode ser chamada por URL.
 * - Usa a chave secreta (service_role) apenas para a função do banco agenda_claim (que também
 *   registra quem já foi lembrado no dia) e para push_targets/push_drop. Nenhuma tabela é lida direto.
 * - Mesmas regras/limites do push do app: endereços só de serviços conhecidos, envio com limite de tempo.
 */
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isAllowedEndpoint } from "../../src/lib/push/endpoint.ts";
import {
  buildReminders,
  reminderUntil,
  splitAgenda,
  todayInBrasilia,
  weekday,
  type AgendaRow,
  type DueRow,
  type RecordingRow,
} from "../../src/lib/push/reminders.ts";

const SITE = "https://workspace.example.com";
const SEND_TIMEOUT_MS = 5000;

export interface RunResult {
  today: string;
  skipped?: string;
  people: number;
  sent: number;
  failed: number;
}

export async function runReminders(now: Date = new Date()): Promise<RunResult> {
  const today = todayInBrasilia(now);
  const base = { today, people: 0, sent: 0, failed: 0 };
  if ([0, 6].includes(weekday(today))) return { ...base, skipped: "fim de semana" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!url || !secret || !vapidPublic || !vapidPrivate) return { ...base, skipped: "variáveis ausentes" };

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const window = { p_today: today, p_until: reminderUntil(today) };
  let tasks: DueRow[];
  let recordings: RecordingRow[] = [];
  const agenda = await admin.rpc("agenda_claim", window);
  if (!agenda.error) {
    ({ tasks, recordings } = splitAgenda((agenda.data ?? []) as AgendaRow[]));
  } else if (agenda.error.code === "PGRST202") {
    // função nova ainda não aplicada no banco: segue só com os prazos (comportamento anterior)
    const old = await admin.rpc("reminders_claim", window);
    if (old.error) throw new Error(`reminders_claim: ${old.error.message}`);
    tasks = (old.data ?? []) as DueRow[];
  } else {
    throw new Error(`agenda_claim: ${agenda.error.message}`);
  }

  const messages = buildReminders(tasks, today, recordings);
  if (messages.size === 0) return base;

  const { data: targets, error: tErr } = await admin.rpc("push_targets", { p_profiles: [...messages.keys()] });
  if (tErr) throw new Error(`push_targets: ${tErr.message}`);

  const site = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ? process.env.NEXT_PUBLIC_SITE_URL : SITE;
  webpush.setVapidDetails(site, vapidPublic, vapidPrivate);

  const rows = ((targets ?? []) as { profile_id: string; endpoint: string; p256dh: string; auth: string }[]).filter((r) => isAllowedEndpoint(r.endpoint));
  const results = await Promise.allSettled(
    rows.map((r) =>
      Promise.race([
        webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify(messages.get(r.profile_id)), {
          TTL: 6 * 60 * 60,
          urgency: "normal",
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), SEND_TIMEOUT_MS)),
      ]).catch(async (e: { statusCode?: number }) => {
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.rpc("push_drop", { p_endpoint: r.endpoint });
        throw e;
      }),
    ),
  );
  const sent = results.filter((x) => x.status === "fulfilled").length;
  return { today, people: messages.size, sent, failed: results.length - sent };
}

async function handler() {
  const r = await runReminders();
  // só números no log (sem nomes, títulos ou endereços)
  console.log("lembrete-prazos", JSON.stringify(r));
}
export default handler;

// dias úteis, 11h UTC = 8h em Brasília
export const config = { schedule: "0 11 * * 1-5" };
