import { defineConfig } from "@playwright/test";

// Mesma porta do `npm run dev`: o Next não aceita dois servidores de dev na
// mesma pasta, então reaproveitamos o que já estiver rodando.
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  // Os testes compartilham o banco de desenvolvimento: rodam em série.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  // No CI, uma repetição absorve o "primeiro carregamento" lento do dev server.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Local: usa o Microsoft Edge já instalado no Windows (sem baixar navegador).
    // No CI (Linux) não há Edge: usa o Chromium baixado pelo Playwright.
    ...(process.env.CI ? {} : { channel: "msedge" }),
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    // No CI sempre sobe um servidor limpo; local reaproveita o do `npm run dev`.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
