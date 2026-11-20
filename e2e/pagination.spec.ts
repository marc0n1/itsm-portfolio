import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const PREFIX = `[e2e] Paginação ${stamp}`;
const Q = `Paginação ${stamp}`;
const TOTAL = 45;

async function withDb<T>(fn: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const cleanup = () =>
  withDb((c) => c.query(`delete from "Ticket" where title like '[e2e] %'`));

test.beforeAll(async () => {
  await cleanup();
  // 45 chamados com datas escalonadas (o 01 é o mais novo): a ordem é
  // determinística, então dá para conferir exatamente o que cai em cada página.
  await withDb((c) =>
    c.query(
      `insert into "Ticket" (id, "organizationId", title, description, "requesterId", "createdAt", "updatedAt")
       select 'e2epg' || md5(random()::text || g), u."organizationId",
              $1 || ' ' || lpad(g::text, 2, '0'), 'Descrição de teste de paginação',
              u.id, now() - (g || ' seconds')::interval, now()
       from generate_series(1, $2::int) g, "User" u
       where u.email = 'solicitante@demo.com'`,
      [PREFIX, TOTAL],
    ),
  );
});
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

const rows = (page: Page) => page.getByTestId("ticket-row");
const summary = (page: Page) => page.getByTestId("page-summary");
const num = (n: number) => String(n).padStart(2, "0");

async function expectRange(page: Page, first: number, last: number) {
  await expect(rows(page)).toHaveCount(last - first + 1);
  await expect(rows(page).first()).toContainText(`${PREFIX} ${num(first)}`);
  await expect(rows(page).last()).toContainText(`${PREFIX} ${num(last)}`);
}

test("a primeira página mostra 20 itens, o resumo e 'Anterior' desabilitado", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  await page.goto(`/tickets?q=${encodeURIComponent(Q)}`);

  await expectRange(page, 1, 20);
  await expect(summary(page)).toHaveText(`Mostrando 1–20 de ${TOTAL}`);
  await expect(page.getByRole("link", { name: "Anterior" })).toHaveCount(0);
  await expect(page.getByText("Anterior")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByLabel("Paginação").locator("[aria-current=page]")).toHaveText("1");
});

test("navegar por 'Próxima' e pelo número preserva a busca e não repete nem perde itens", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  await page.goto(`/tickets?q=${encodeURIComponent(Q)}`);

  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/q=/);
  await expectRange(page, 21, 40);
  await expect(summary(page)).toHaveText(`Mostrando 21–40 de ${TOTAL}`);

  await page.getByRole("link", { name: "Página 3" }).click();
  await expectRange(page, 41, 45);
  await expect(summary(page)).toHaveText(`Mostrando 41–${TOTAL} de ${TOTAL}`);
  await expect(page.getByRole("link", { name: "Próxima" })).toHaveCount(0);

  await page.getByRole("link", { name: "Anterior" }).click();
  await expectRange(page, 21, 40);
});

test("?page= inválido ou fora do intervalo é corrigido, nunca uma tela vazia", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  const q = encodeURIComponent(Q);

  await page.goto(`/tickets?q=${q}&page=99`);
  await expectRange(page, 41, 45); // última página
  await expect(summary(page)).toHaveText(`Mostrando 41–${TOTAL} de ${TOTAL}`);

  for (const bad of ["abc", "-5", "0", "2.5"]) {
    await page.goto(`/tickets?q=${q}&page=${bad}`);
    await expectRange(page, 1, 20);
  }
});

test("filtrar de novo volta à página 1", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  await page.goto(`/tickets?q=${encodeURIComponent(Q)}&page=2`);
  await expectRange(page, 21, 40);

  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expectRange(page, 1, 20);
});

test("resultado pequeno mostra o resumo, sem navegação por páginas; sem resultado, o aviso", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");

  // " 4" casa só com 40..45 => 6 resultados.
  await page.goto(`/tickets?q=${encodeURIComponent(`${Q} 4`)}`);
  await expect(rows(page)).toHaveCount(6);
  await expect(summary(page)).toHaveText("Mostrando 1–6 de 6");
  await expect(page.getByRole("link", { name: "Próxima" })).toHaveCount(0);
  await expect(page.getByText("Próxima")).toHaveCount(0);

  await page.goto(`/tickets?q=${encodeURIComponent("nada-disso-existe-xyz")}`);
  await expect(page.getByText("Nenhum chamado encontrado com esses filtros.")).toBeVisible();
  await expect(page.getByTestId("page-summary")).toHaveCount(0);
});

test("o solicitante também pagina a própria lista", async ({ page }) => {
  await loginAs(page, "solicitante@demo.com");
  await page.goto(`/tickets?q=${encodeURIComponent(Q)}`);
  await expect(page.getByRole("heading", { name: "Meus chamados" })).toBeVisible();
  await expectRange(page, 1, 20);

  await page.getByRole("link", { name: "Próxima" }).click();
  await expectRange(page, 21, 40);
});
