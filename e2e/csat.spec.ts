import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const TITLE = `[e2e] CSAT ${stamp}`;
const BOM = "﻿";

async function withDb<T>(fn: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const cleanup = () => withDb((c) => c.query(`delete from "Ticket" where title like '[e2e] %'`));

test.beforeAll(cleanup);
test.afterAll(cleanup);
test.describe.configure({ mode: "serial" });

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

let ticketUrl = "";
let n = "";

const rating = (page: Page) => page.getByTestId("rating");
const summary = (page: Page) => page.getByTestId("rating-summary");

/** Muda status/responsável pelo painel de atendimento (equipe). */
async function attend(page: Page, status: string, assignee?: string) {
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Atendimento" }) });
  await form.getByLabel("Status").selectOption(status);
  if (assignee) await form.getByLabel("Responsável").selectOption({ label: assignee });
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByTestId("history")).toContainText("Status:");
}

test("chamado em aberto não pode ser avaliado", async ({ page }) => {
  await loginAs(page, "solicitante@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TITLE);
  await page.getByLabel("Descrição").fill("Descrição de teste com mais de dez caracteres.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  ticketUrl = page.url();
  n = (await page.getByText(/^Chamado #\d+$/).innerText()).replace(/\D/g, "");

  await expect(rating(page)).toHaveCount(0);
});

test("a equipe resolve o chamado, mas NÃO vê o formulário de avaliação", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await attend(page, "RESOLVED", "Carlos Agente");

  // Quem atende não avalia o próprio trabalho, nem o admin.
  await expect(rating(page)).toHaveCount(0);
  await expect(summary(page)).toHaveCount(0); // ainda sem avaliação
  await loginAs(page, "admin@demo.com");
  await page.goto(ticketUrl);
  await expect(rating(page)).toHaveCount(0);
});

test("o solicitante avalia com nota e comentário; ao reabrir a página os valores continuam", async ({
  page,
}) => {
  await loginAs(page, "solicitante@demo.com");
  await page.goto(ticketUrl);

  await expect(rating(page)).toContainText("Como foi o atendimento?");
  // Sem escolher nota, o navegador barra o envio (o servidor também valida).
  await page.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(page.getByTestId("rating").getByRole("status")).toHaveCount(0);

  await page.getByText("2 · Insatisfeito").click();
  await page.getByLabel(/Quer comentar/).fill("Demorou mais do que o combinado.");
  await page.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(rating(page).getByRole("status")).toContainText("Obrigado pela avaliação!");
  // O formulário mostra o que foi salvo, sem voltar ao vazio.
  await expect(page.getByLabel("2 · Insatisfeito")).toBeChecked();
  await expect(page.getByLabel(/Quer comentar/)).toHaveValue("Demorou mais do que o combinado.");

  await page.reload();
  await expect(page.getByLabel("2 · Insatisfeito")).toBeChecked();
  await expect(page.getByRole("button", { name: "Atualizar avaliação" })).toBeVisible();
  await expect(rating(page)).toContainText("Você já avaliou este chamado");
});

test("a equipe vê a avaliação e o responsável é notificado", async ({ page }) => {
  await loginAs(page, "agente@demo.com");

  await page.getByRole("button", { name: /^Notificações/ }).click();
  await expect(page.getByTestId("notifications-panel")).toContainText(
    `Sara Solicitante avaliou o chamado #${n}: 2 de 5`,
  );

  await page.goto(ticketUrl);
  await expect(summary(page)).toContainText("2 de 5 · Insatisfeito");
  await expect(summary(page)).toContainText("Demorou mais do que o combinado.");
  await expect(summary(page)).toContainText("Avaliado em");
});

test("o solicitante muda de ideia: nota nova, comentário com fórmula, aviso de alteração", async ({
  page,
}) => {
  await loginAs(page, "solicitante@demo.com");
  await page.goto(ticketUrl);
  await page.getByText("5 · Muito satisfeito").click();
  await page.getByLabel(/Quer comentar/).fill("=1+1 resolveram, valeu");
  await page.getByRole("button", { name: "Atualizar avaliação" }).click();
  await expect(rating(page).getByRole("status")).toContainText("Obrigado");

  await loginAs(page, "agente@demo.com");
  await page.getByRole("button", { name: /^Notificações/ }).click();
  await expect(page.getByTestId("notifications-panel")).toContainText(
    `Sara Solicitante alterou a avaliação do chamado #${n}: 5 de 5`,
  );
  await page.goto(ticketUrl);
  await expect(summary(page)).toContainText("5 de 5 · Muito satisfeito");
  await expect(summary(page)).not.toContainText("Demorou mais");
});

test("reabrir o chamado NÃO apaga a avaliação; o formulário volta quando resolver de novo", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await attend(page, "IN_PROGRESS");
  await expect(summary(page)).toContainText("5 de 5"); // continua para a equipe

  await loginAs(page, "solicitante@demo.com");
  await page.goto(ticketUrl);
  await expect(rating(page)).toHaveCount(0); // aberto de novo: não avalia

  await loginAs(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await attend(page, "RESOLVED");

  await loginAs(page, "solicitante@demo.com");
  await page.goto(ticketUrl);
  await expect(page.getByLabel("5 · Muito satisfeito")).toBeChecked(); // a nota anterior, para editar
});

test("o dashboard da equipe mostra os indicadores; o solicitante não os vê", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  const section = page.getByRole("region", { name: "Satisfação do solicitante" });
  await expect(section).toBeVisible();
  await expect(section.getByTestId("kpi").filter({ hasText: "CSAT" })).not.toContainText("—");
  await expect(section.getByTestId("kpi").filter({ hasText: "Nota média" })).toContainText("de 5");
  await expect(section.getByTestId("kpi").filter({ hasText: "Taxa de resposta" })).not.toContainText("—");
  // O CSAT deste teste (nota 5) aparece na distribuição.
  await expect(section.getByTestId("csat-distribution").getByRole("listitem").first()).toContainText("5 · Muito satisfeito");

  await loginAs(page, "solicitante@demo.com");
  await expect(page.getByRole("region", { name: "Satisfação do solicitante" })).toHaveCount(0);
});

test("o SERVIDOR recusa uma avaliação forjada pela equipe (não basta esconder o formulário)", async ({
  page,
}) => {
  // 1) O solicitante reenvia a mesma avaliação (5 + mesmo comentário: nada muda)
  //    e capturamos a requisição real da Server Action.
  await loginAs(page, "solicitante@demo.com");
  await page.goto(ticketUrl);
  await page.getByText("5 · Muito satisfeito").click();
  await page.getByLabel(/Quer comentar/).fill("=1+1 resolveram, valeu");

  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    page.getByRole("button", { name: "Atualizar avaliação" }).click(),
  ]);
  const actionId = request.headers()["next-action"];
  const contentType = request.headers()["content-type"];
  const original = request.postData()!;
  await expect(rating(page).getByRole("status")).toContainText("Obrigado");

  // 2) Troca a nota de 5 para 1 no corpo capturado (precisa de fato mudar).
  const forged = original.replace(
    /(name="[^"]*score"\r?\n\r?\n)5/,
    (_match, head: string) => `${head}1`,
  );
  expect(forged).not.toBe(original);

  // 3) Reenvia como AGENTE (staff). O servidor tem de recusar.
  await loginAs(page, "agente@demo.com");
  const res = await page.request.post(ticketUrl, {
    headers: { "next-action": actionId, "content-type": contentType, accept: "text/x-component" },
    data: Buffer.from(forged),
  });
  expect(await res.text()).toContain("Só o solicitante pode avaliar");

  // 4) E o banco continua com a nota 5 original.
  const score = await withDb(async (c) =>
    (await c.query(`select "csatScore" from "Ticket" where title = $1`, [TITLE])).rows[0].csatScore,
  );
  expect(score).toBe(5);
});

test("o relatório CSV traz a nota e o comentário, com a fórmula neutralizada", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  const res = await page.request.get(`/reports/export?q=${encodeURIComponent(TITLE)}`);
  expect(res.status()).toBe(200);
  const text = (await res.text()).replace(BOM, "");
  const lines = text.trim().split("\r\n");
  expect(lines[0]).toContain("Nota do solicitante (CSAT);Comentário do solicitante");
  expect(lines[1]).toMatch(/;5;'=1\+1 resolveram, valeu$/);
});

test("o banco recusa uma nota fora de 1 a 5, mesmo gravando por fora da aplicação", async () => {
  await withDb(async (c) => {
    for (const bad of [0, 6, -1]) {
      await expect(
        c.query(`update "Ticket" set "csatScore" = $1 where title = $2`, [bad, TITLE]),
      ).rejects.toThrow(/Ticket_csatScore_range/);
    }
    // E uma nota válida continua passando.
    await c.query(`update "Ticket" set "csatScore" = 3 where title = $1`, [TITLE]);
  });
});
