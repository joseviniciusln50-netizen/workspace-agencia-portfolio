import { expect, test, type Page } from "@playwright/test";

/** Telas abertas (sem login) e proteção das rotas — iPhone, Android e desktop. */

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow, "não pode haver rolagem lateral").toBe(false);
}

test.describe("sem login", () => {
  for (const path of ["/", "/dashboard", "/tarefas", "/briefings", "/clientes", "/equipe", "/perfil", "/admin"]) {
    test(`${path} exige login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/entrar/);
    });
  }

  test("link de redefinição sem sessão volta ao login com aviso", async ({ page }) => {
    await page.goto("/redefinir-senha");
    await expect(page).toHaveURL(/motivo=link-invalido/);
    await expect(page.getByRole("status")).toContainText("expirou ou já foi usado");
  });

  test("foto de perfil não é servida sem login", async ({ page }) => {
    await page.goto("/avatar/00000000-0000-4000-8000-000000000001?v=x");
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("tela de login", () => {
  test("composição: formulário visível, sem sobreposição e sem rolagem lateral", async ({ page }) => {
    await page.goto("/entrar");
    const card = page.locator("[data-auth-card]");
    await expect(card).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar/i })).toBeInViewport();
    await noHorizontalScroll(page);

    // fotos da equipe: NENHUMA imagem visível da composição pode encostar no card (celular e desktop)
    const scene = page.locator("main > div[aria-hidden]");
    if (await scene.isVisible()) {
      const c = (await card.boundingBox())!;
      const boxes = await scene.locator("img").evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
      );
      expect(boxes.length, "a composição deve mostrar a equipe").toBeGreaterThan(0);
      const overlaps = boxes.some((s) => s.x < c.x + c.width && s.x + s.w > c.x && s.y < c.y + c.height && s.y + s.h > c.y);
      expect(overlaps, "foto da equipe não pode cobrir o card").toBe(false);
    }
    // campos com 16px (sem zoom automático do iPhone)
    const sizes = await page.locator("input").evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize));
    expect(sizes.every((s) => s === "16px")).toBe(true);
  });

  test("credenciais erradas → mensagem genérica, sem sair da tela", async ({ page }) => {
    await page.goto("/entrar");
    await page.locator("input[name=email]").fill("ninguem.inexistente@example.com");
    await page.locator("input[name=password]").fill("SenhaErrada12345");
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page.locator("p[role=alert]")).toHaveText(/e-mail ou senha incorretos/i);
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.locator("input[name=password]")).toHaveValue("");
  });

  test("links para recuperar senha e primeiro acesso", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("link", { name: /esqueci minha senha/i }).click();
    await expect(page).toHaveURL(/\/recuperar-senha/);
    await expect(page.getByRole("button", { name: /enviar link/i })).toBeVisible();
    await page.goto("/entrar");
    await page.getByRole("link", { name: /ativar minha conta/i }).click();
    await expect(page).toHaveURL(/\/ativar/);
  });

  test("movimento reduzido: o telão fica parado", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/entrar");
    const scene = page.locator("main > div[aria-hidden] img").first();
    if (!(await scene.isVisible())) test.skip(true, "tela baixa: cena oculta");
    const first = await scene.getAttribute("alt");
    await page.waitForTimeout(8000); // mais que uma troca de cena (7 s)
    expect(await scene.getAttribute("alt")).toBe(first);
  });
});

test.describe("primeiro acesso (/ativar)", () => {
  test("validação no servidor e código inválido com mensagem genérica", async ({ page }) => {
    await page.goto("/ativar");
    await page.locator("input[name=full_name]").fill("Pessoa Teste");
    await page.locator("input[name=email]").fill("ninguem.convidado@example.com");
    await page.locator("input[name=code]").fill("abcd-ef23");
    await page.locator("input[name=password]").fill("curta1");
    await page.locator("input[name=confirmation]").fill("curta1");
    await page.getByRole("button", { name: /ativar e entrar/i }).click();
    await expect(page.locator("p[role=alert]")).toContainText("10 caracteres");
    // Após o erro, o que foi digitado continua lá (só as senhas são limpas).
    await expect(page.locator("input[name=full_name]")).toHaveValue("Pessoa Teste");
    await expect(page.locator("input[name=email]")).toHaveValue("ninguem.convidado@example.com");
    await expect(page.locator("input[name=code]")).toHaveValue("abcd-ef23");
    await expect(page.locator("input[name=password]")).toHaveValue("");

    await page.locator("input[name=password]").fill("SenhaTeste12345");
    await page.locator("input[name=confirmation]").fill("SenhaTeste12345");
    await page.getByRole("button", { name: /ativar e entrar/i }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Não foi possível ativar");
    await expect(page).toHaveURL(/\/ativar/);
    await noHorizontalScroll(page);
  });
});

test.describe("app instalável", () => {
  test("manifest e ícones abertos (o celular busca antes do login), sem expor páginas", async ({ page, request }) => {
    await page.goto("/entrar");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m).toMatchObject({ short_name: "Workspace", start_url: "/dashboard", display: "standalone" });
    for (const icon of m.icons as { src: string }[]) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()["content-type"]).toBe("image/png");
    }
  });
});

test.describe("notificações", () => {
  test("service worker aberto, sem cache e SEM interceptar páginas (nenhum dado guardado offline)", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    // o navegador precisa sempre conferir a versão (no-store, no-cache ou max-age=0)
    expect(res.headers()["cache-control"]).toMatch(/no-store|no-cache|max-age=0/);
    const code = await res.text();
    expect(code).toContain('addEventListener("push"');
    expect(code).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(code).not.toMatch(/caches\.open/);
  });
});

test.describe("tema de Natal (sazonal)", () => {
  test("?tema=natal: gorro e neve aparecem e não bloqueiam o formulário", async ({ page }) => {
    await page.goto("/entrar?tema=natal");
    const card = page.locator("[data-auth-card]");
    await expect(card.locator("svg[viewBox='0 0 309.639 309.639']")).toBeVisible();
    const flakes = page.locator(".ajm-snowflake");
    expect(await flakes.count()).toBeGreaterThan(0);
    // a neve é recortada exatamente no card (os flocos nunca passam por cima dos campos)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const layer = document.querySelector(".ajm-snowflake")!.parentElement!;
          const c = document.querySelector("[data-auth-card]")!.getBoundingClientRect();
          const v = (n: string) => parseFloat(layer.style.getPropertyValue(n));
          return Math.abs(v("--hole-x") - c.left) < 2 && Math.abs(v("--hole-y") - c.top) < 2 && Math.abs(v("--hole-w") - c.width) < 2;
        }),
      )
      .toBe(true);
    // nada da decoração recebe toques: o ponto central do botão continua sendo o botão
    const btn = page.getByRole("button", { name: /entrar/i });
    const box = (await btn.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "", [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toMatch(/entrar/i);
    await page.locator("input[name=email]").click();
    await expect(page.locator("input[name=email]")).toBeFocused();
    await noHorizontalScroll(page);
  });

  test("?tema=padrao: identidade intacta, sem decoração", async ({ page }) => {
    await page.goto("/entrar?tema=padrao");
    await expect(page.locator("[data-auth-card]")).toBeVisible();
    await expect(page.locator("[data-auth-card] svg[viewBox='0 0 309.639 309.639']")).toHaveCount(0);
    await expect(page.locator(".ajm-snowflake")).toHaveCount(0);
  });
});
