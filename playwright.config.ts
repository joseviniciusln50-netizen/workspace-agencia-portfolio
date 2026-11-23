import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta (navegador real) — `npm run test:e2e`.
 * - Usa o Microsoft Edge instalado (channel "msedge"): nada de baixar navegadores.
 * - Sobe o `npm run dev` se ele não estiver rodando (ou reaproveita o que já está).
 * - Testes logados usam o COLABORADOR de teste (TEST_USER_EMAIL/PASSWORD no .env.local; nunca impressos).
 * - Um teste por vez: todos usam o mesmo usuário de teste.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local: os testes logados são pulados
}

const edge = { browserName: "chromium" as const, channel: "msedge" };

/** E2E_BASE_URL=https://… roda os mesmos testes contra o site PUBLICADO (sem subir servidor local). */
const remote = process.env.E2E_BASE_URL?.replace(/\/+$/, "");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: remote ?? "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "off",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], ...edge } },
    { name: "android", use: { ...devices["Pixel 7"], ...edge } },
    { name: "desktop", use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 900 }, ...edge } },
  ],
  webServer: remote
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/entrar",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
