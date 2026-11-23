import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // .env.local (só para os testes de banco; nada é impresso). `npm run test:db` usa --mode db.
    env: { ...loadEnv(mode, process.cwd(), ""), RUN_DB_TESTS: mode === "db" ? "1" : "" },
    // Testes de banco usam o MESMO usuário de teste: um arquivo por vez (sem interferência).
    fileParallelism: mode !== "db",
  },
}));
