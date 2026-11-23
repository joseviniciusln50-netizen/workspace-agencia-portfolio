import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hideDevOverlay } from "./dev-overlay";

/**
 * Gravações pela INTERFACE, com o colaborador de teste: agendar → aparece na aba e no calendário →
 * marcar como realizada → excluir. Tudo o que é criado aqui é excluído no fim.
 * (As regras em si são provadas no banco: tests/integration/recordings.test.ts.)
 */
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
test.skip(!email || !password, "defina TEST_USER_EMAIL e TEST_USER_PASSWORD no .env.local");
test.describe.configure({ mode: "serial" });
test.beforeEach(({ page }) => hideDevOverlay(page));

async function login(page: Page) {
  await page.goto("/entrar");
  await page.locator("input[name=email]").fill(email!);
  await page.locator("input[name=password]").fill(password!);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Rede de segurança: apaga (pela conta de teste) as gravações de teste que possam ter sobrado. */
test.afterAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.auth.signInWithPassword({ email: email!, password: password! });
  const me = data.user?.id;
  if (!me) return;
  for (const r of (await db.from("recordings").select("id, title, created_by")).data ?? [])
    if (r.title.startsWith("E2E ") && r.created_by === me) await db.rpc("recording_delete", { p_recording: r.id });
  await db.auth.signOut();
});

test("gravação: agendar, ver no calendário, marcar como realizada e excluir", async ({ page }) => {
  const title = `E2E ${Date.now().toString(36)} — captação`;
  await login(page);
  await page.goto("/gravacoes");
  await expect(page.getByRole("heading", { level: 1, name: /gravações/i })).toBeVisible();

  await page.getByRole("button", { name: /agendar (a primeira )?gravação/i }).first().click();
  const form = page.getByRole("dialog", { name: "Agendar gravação" });
  await form.locator("#g-title").fill(title);
  // data: hoje (padrão do formulário) — aparece em "Hoje" e no dia já selecionado do calendário
  await form.locator("#g-end").fill("16:00");
  await form.getByRole("button", { name: /^agendar gravação$/i }).click();
  await expect(form.getByRole("alert")).toContainText(/início/i); // término sem início não vale
  await form.locator("#g-start").fill("14:00");
  await form.locator("#g-location").fill("Estúdio da agência");
  await form.getByRole("button", { name: /^agendar gravação$/i }).click();
  await expect(form).toBeHidden();

  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toBeVisible();
  await expect(card).toContainText("14:00–16:00");
  await expect(page.getByText("Hoje", { exact: true })).toBeVisible();

  // calendário do mural: a gravação aparece no dia, com o horário, e abre na aba
  await page.goto("/tarefas?view=calendario");
  const item = page.getByRole("link", { name: new RegExp(title) });
  await expect(item).toBeVisible();
  await expect(item).toContainText(/Gravação · 14:00/);
  await item.click();
  await expect(page).toHaveURL(/\/gravacoes\?g=/);
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();

  // status
  await sheet.getByRole("button", { name: /marcar como realizada/i }).click();
  await expect(sheet.getByRole("button", { name: /voltar para agendada/i })).toBeVisible();

  // excluir (2 passos)
  await sheet.getByRole("button", { name: /^excluir$/i }).click();
  await sheet.getByRole("button", { name: /confirmar exclusão/i }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
});

test("tarefa de captação vira gravação e sai do mural", async ({ page }) => {
  const title = `E2E ${Date.now().toString(36)} — captação no mural`;
  await login(page);
  await page.goto("/tarefas");
  await page.getByRole("button", { name: /nova tarefa/i }).first().click();
  const form = page.getByRole("dialog", { name: "Nova tarefa" });
  await form.locator("#task-title").fill(title);
  await form.getByRole("button", { name: /criar tarefa/i }).click();
  await expect(form).toBeHidden();

  await page.getByRole("button", { name: new RegExp(title) }).click();
  const sheet = page.getByRole("dialog", { name: title });
  await sheet.getByRole("button", { name: /agendar como gravação/i }).click();

  const rec = page.getByRole("dialog", { name: "Agendar gravação" });
  await expect(rec.locator("#g-title")).toHaveValue(title); // veio preenchido da tarefa
  await expect(rec.getByRole("checkbox", { name: /tirar a tarefa do mural/i })).toBeChecked();
  await rec.locator("#g-start").fill("10:00");
  await rec.getByRole("button", { name: /^agendar gravação$/i }).click();

  // abre a gravação recém-criada na aba
  await expect(page).toHaveURL(/\/gravacoes\?g=/);
  const opened = page.getByRole("dialog", { name: title });
  await expect(opened).toBeVisible();

  // a tarefa saiu do mural
  await page.goto("/tarefas");
  await expect(page.getByRole("heading", { level: 1, name: /mural de tarefas/i })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  // (a gravação de teste é apagada no afterAll)
});
