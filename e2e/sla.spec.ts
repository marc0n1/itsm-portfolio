import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();

// Chamados criados direto no banco, com datas controladas (SLA depende do tempo).
const T = {
  breached: `[e2e] SLA estourado ${stamp}`, // crítica há 10h, sem resposta
  paused: `[e2e] SLA pausado ${stamp}`, // média há 10h, Aguardando há 2h
  fresh: `[e2e] SLA recente ${stamp}`, // alta há 30min, sem resposta
  flip: `[e2e] SLA troca de meta ${stamp}`, // alta há 3h, já respondido
};

async function withDb<R>(fn: (c: Client) => Promise<R>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

type PolicyRow = {
  id: string;
  organizationId: string;
  priority: string;
  responseMinutes: number;
  resolutionMinutes: number;
  updatedAt: Date;
};
let policySnapshot: PolicyRow[] = [];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const row = (page: Page, title: string) =>
  page.getByRole("row").filter({ hasText: title });

const dbTicket = (title: string) =>
  withDb(async (c) => {
    const { rows } = await c.query(
      `select "firstResponseAt", "slaPausedAt", "slaPausedSeconds", status from "Ticket" where title = $1`,
      [title],
    );
    return rows[0];
  });

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 1200 } });

test.beforeAll(async () => {
  await withDb(async (c) => {
    const { rows: orgs } = await c.query(`select id from "Organization" where slug = 'demo'`);
    const org = orgs[0].id;
    const { rows: users } = await c.query(
      `select id from "User" where email = 'solicitante@demo.com'`,
    );
    const requester = users[0].id;

    // Guarda as metas atuais para restaurar no fim (nunca apaga config real).
    policySnapshot = (
      await c.query(`select * from "SlaPolicy" where "organizationId" = $1`, [org])
    ).rows;
    await c.query(`delete from "SlaPolicy" where "organizationId" = $1`, [org]);

    const insert = (
      title: string,
      priority: string,
      status: string,
      createdMin: number,
      extra: { responseAfterMin?: number; pausedAgoMin?: number } = {},
    ) =>
      c.query(
        `insert into "Ticket"
           (id, title, description, status, priority, "organizationId", "requesterId",
            "createdAt", "firstResponseAt", "slaPausedAt", "updatedAt")
         values (gen_random_uuid()::text, $1, 'Chamado do teste de SLA.', $2::"TicketStatus",
                 $3::"Priority", $4, $5,
                 now() - make_interval(mins => $6),
                 case when $7::int is null then null
                      else now() - make_interval(mins => $6) + make_interval(mins => $7::int) end,
                 case when $8::int is null then null else now() - make_interval(mins => $8::int) end,
                 now())`,
        [
          title,
          status,
          priority,
          org,
          requester,
          createdMin,
          extra.responseAfterMin ?? null,
          extra.pausedAgoMin ?? null,
        ],
      );

    await insert(T.breached, "CRITICAL", "OPEN", 10 * 60);
    await insert(T.paused, "MEDIUM", "WAITING", 10 * 60, {
      responseAfterMin: 30,
      pausedAgoMin: 2 * 60,
    });
    await insert(T.fresh, "HIGH", "OPEN", 30);
    await insert(T.flip, "HIGH", "IN_PROGRESS", 3 * 60, { responseAfterMin: 10 });
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query(`delete from "Ticket" where title like '[e2e] %'`);
    // Restaura exatamente as metas que existiam antes dos testes.
    const { rows: orgs } = await c.query(`select id from "Organization" where slug = 'demo'`);
    await c.query(`delete from "SlaPolicy" where "organizationId" = $1`, [orgs[0].id]);
    for (const p of policySnapshot) {
      await c.query(
        `insert into "SlaPolicy" (id, "organizationId", priority, "responseMinutes", "resolutionMinutes", "updatedAt")
         values ($1, $2, $3::"Priority", $4, $5, $6)`,
        [p.id, p.organizationId, p.priority, p.responseMinutes, p.resolutionMinutes, p.updatedAt],
      );
    }
  });
});

test("equipe vê o SLA na lista, no quadro e no detalhe; solicitante não vê", async ({
  page,
}) => {
  await login(page, "agente@demo.com");

  // Lista: chamado crítico antigo sem resposta => estourado.
  await page.goto("/tickets");
  await expect(page.getByRole("columnheader", { name: "SLA" })).toBeVisible();
  await expect(row(page, T.breached).locator("[data-sla-state]")).toHaveAttribute(
    "data-sla-state",
    "breached",
  );
  // Chamado novo ainda está no prazo.
  await expect(row(page, T.fresh).locator("[data-sla-state]")).toHaveAttribute(
    "data-sla-state",
    "ok",
  );
  // Pausado mostra o relógio parado (com tempo restante congelado).
  const paused = row(page, T.paused).locator("[data-sla-state]");
  await expect(paused).toHaveAttribute("data-sla-state", "paused");
  await expect(paused).toContainText(/Pausado \(resta/);

  // Quadro.
  await page.goto("/tickets/board");
  await expect(
    page.getByTestId("card").filter({ hasText: T.breached }).locator("[data-sla-state]"),
  ).toHaveAttribute("data-sla-state", "breached");

  // Detalhe: painel com os dois relógios.
  await page.goto("/tickets");
  await page.getByRole("link", { name: T.breached }).click();
  const panel = page.getByTestId("sla-panel");
  await expect(panel).toContainText("Primeira resposta");
  await expect(panel).toContainText("Resolução");
  await expect(panel.locator('[data-sla-state="breached"]')).toHaveCount(2);

  // Solicitante: nada de SLA (indicador interno).
  await page.context().clearCookies();
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets");
  await expect(page.getByRole("columnheader", { name: "SLA" })).toHaveCount(0);
  await expect(page.locator("[data-sla-state]")).toHaveCount(0);
  await page.getByRole("link", { name: T.breached }).click();
  await expect(page.getByTestId("sla-panel")).toHaveCount(0);
});

test("1ª resposta: só o comentário PÚBLICO da equipe conta", async ({ page }) => {
  // Solicitante comenta: não conta como resposta.
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets");
  await page.getByRole("link", { name: T.fresh }).click();
  await page.getByPlaceholder("Escreva um comentário...").fill("Alguém pode ver?");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Alguém pode ver?")).toBeVisible();
  expect((await dbTicket(T.fresh)).firstResponseAt).toBeNull();

  // Agente: nota interna também não conta.
  await page.context().clearCookies();
  await login(page, "agente@demo.com");
  await page.goto("/tickets");
  await page.getByRole("link", { name: T.fresh }).click();
  await page.getByPlaceholder("Escreva um comentário...").fill("Anotação só da equipe.");
  await page.getByLabel(/Nota interna/).check();
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Anotação só da equipe.")).toBeVisible();
  expect((await dbTicket(T.fresh)).firstResponseAt).toBeNull();

  // Comentário público da equipe: encerra o relógio de resposta.
  await page.getByPlaceholder("Escreva um comentário...").fill("Estamos analisando.");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Estamos analisando.")).toBeVisible();
  expect((await dbTicket(T.fresh)).firstResponseAt).not.toBeNull();

  // O painel passa a mostrar a resposta como cumprida.
  await expect(
    page.getByTestId("sla-panel").locator('[data-sla-state="met"]').first(),
  ).toBeVisible();
});

test("sair de Aguardando retoma o relógio e soma o tempo parado", async ({ page }) => {
  const before = await dbTicket(T.paused);
  expect(before.slaPausedAt).not.toBeNull();
  expect(before.slaPausedSeconds).toBe(0);

  await login(page, "agente@demo.com");
  await page.goto("/tickets/board");
  await page
    .getByTestId("card")
    .filter({ hasText: T.paused })
    .getByRole("combobox")
    .selectOption("IN_PROGRESS");
  await expect(
    page
      .getByTestId("column-IN_PROGRESS")
      .getByTestId("card")
      .filter({ hasText: T.paused }),
  ).toBeVisible();

  // Estava pausado há ~2h: o acumulado fica em ~7200s e a pausa é limpa.
  await expect
    .poll(async () => (await dbTicket(T.paused)).slaPausedAt)
    .toBeNull();
  const after = await dbTicket(T.paused);
  expect(after.slaPausedSeconds).toBeGreaterThan(2 * 3600 - 120);
  expect(after.slaPausedSeconds).toBeLessThan(2 * 3600 + 120);

  // E voltar para Aguardando pausa de novo, sem perder o acumulado.
  await page
    .getByTestId("card")
    .filter({ hasText: T.paused })
    .getByRole("combobox")
    .selectOption("WAITING");
  await expect.poll(async () => (await dbTicket(T.paused)).slaPausedAt).not.toBeNull();
  expect((await dbTicket(T.paused)).slaPausedSeconds).toBe(after.slaPausedSeconds);
});

test("metas de SLA: só admin edita; valida; e recalcula os chamados", async ({
  page,
}) => {
  // Agente e solicitante não acessam.
  await login(page, "agente@demo.com");
  await expect(page.getByRole("link", { name: "SLA", exact: true })).toHaveCount(0);
  await page.goto("/admin/sla");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().clearCookies();

  await login(page, "admin@demo.com");

  // Antes: chamado alto de 3h, meta de resolução de 8h => dentro do prazo.
  await page.goto("/tickets");
  await expect(row(page, T.flip).locator("[data-sla-state]")).toHaveAttribute(
    "data-sla-state",
    "ok",
  );

  await page.getByRole("link", { name: "SLA", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sla/);
  const resolution = page.getByLabel("Resolução, prioridade Alta");
  const response = page.getByLabel("Primeira resposta, prioridade Alta");

  // Valida no servidor: resposta maior que a resolução é recusada e nada se perde.
  await resolution.fill("2");
  await response.fill("5");
  await page.getByRole("button", { name: "Salvar metas" }).click();
  await expect(page.getByText(/não pode demorar mais que a resolução/)).toBeVisible();
  await expect(resolution).toHaveValue("2");
  await expect(response).toHaveValue("5");

  // Texto inválido também é recusado.
  await response.fill("abc");
  await page.getByRole("button", { name: "Salvar metas" }).click();
  await expect(page.getByText(/números válidos/)).toBeVisible();

  // Valores válidos (aceita vírgula decimal).
  await response.fill("0,5");
  await page.getByRole("button", { name: "Salvar metas" }).click();
  await expect(page.getByText(/Metas salvas/)).toBeVisible();

  // Persistiu.
  await page.reload();
  await expect(page.getByLabel("Resolução, prioridade Alta")).toHaveValue("2");
  await expect(page.getByLabel("Primeira resposta, prioridade Alta")).toHaveValue("0.5");

  // Depois: meta de 2h, chamado de 3h => estourado (recalculado sem migração).
  await page.goto("/tickets");
  await expect(row(page, T.flip).locator("[data-sla-state]")).toHaveAttribute(
    "data-sla-state",
    "breached",
  );
});

test("dashboard: indicadores e gráfico só para a equipe", async ({ page }) => {
  await login(page, "agente@demo.com");

  // Só a seção de SLA (a de satisfação, que tem os seus próprios cartões, é testada no csat.spec).
  const kpis = page
    .getByRole("region", { name: "Indicadores de SLA" })
    .getByTestId("kpi");
  await expect(kpis).toHaveCount(6);
  // Há chamados estourados (criados no beforeAll): o cartão aparece em alerta.
  const breached = kpis.filter({ hasText: "SLA estourado" });
  await expect(breached).toHaveAttribute("data-status", "critical");
  await expect(breached.locator("p").nth(1)).not.toHaveText("0");

  // Gráfico: descrição acessível, tooltip por foco (teclado) e visão em tabela.
  const chart = page.getByRole("img", { name: /Chamados abertos por dia/ });
  await expect(chart).toBeVisible();
  await page.locator("rect[tabindex='0']").last().focus();
  await expect(page.getByRole("tooltip")).toContainText(/chamado/);

  await page.getByText("Ver como tabela").click();
  await expect(
    page.locator("details table tbody tr"),
  ).toHaveCount(14);

  // Solicitante não vê indicadores nem gráfico.
  await page.context().clearCookies();
  await login(page, "solicitante@demo.com");
  await expect(page.getByTestId("kpi")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Chamados abertos por dia/ })).toHaveCount(0);
});
