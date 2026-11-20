import { defineConfig } from "@playwright/test";

// Mesma porta do `npm run dev`: o Next não aceita dois servidores de dev na
// mesma pasta, então reaproveitamos o que já estiver rodando.
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  // Os testes compartilham o banco de desenvolvimento: rodam em série.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Usa o Microsoft Edge já instalado no Windows (sem baixar navegador).
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
