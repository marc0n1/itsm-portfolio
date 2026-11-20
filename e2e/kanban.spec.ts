import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();

// Cada teste usa o próprio chamado [e2e]: nada aqui depende ou altera o seed.
const T = {
  drag: `[e2e] Arrastar ${stamp}`,
  select: `[e2e] Seletor ${stamp}`,
  critical: `[e2e] Crítico ${stamp}`,
  low: `[e2e] Baixo ${stamp}`,
  mine: `[e2e] Meu ${stamp}`,
};

async function withDb<T>(fn: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const column = (page: Page, status: string) =>
  page.getByTestId(`column-${status}`);
const card = (page: Page, title: string) =>
  page.getByTestId("card").filter({ hasText: title });
const cardIn = (page: Page, status: string, title: string) =>
  column(page, status).getByTestId("card").filter({ hasText: title });

/** Arrasta com o mouse em passos, como uma pessoa faria (o dnd-kit precisa). */
async function dragCardTo(page: Page, title: string, status: string) {
  const from = (await card(page, title).boundingBox())!;
  const to = (await column(page, status).boundingBox())!;

  // Começa na borda do card (fora do link e do seletor).
  await page.mouse.move(from.x + 6, from.y + 6);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 90, { steps: 15 });
  await page.mouse.up();
}

test.describe.configure({ mode: "serial" });

// Janela alta: o arrasto com o mouse precisa que card e colunas estejam
// visíveis (coordenadas fora da tela não geram eventos de ponteiro).
test.use({ viewport: { width: 1400, height: 1600 } });

test.beforeAll(async () => {
  await withDb(async (c) => {
    const { rows: orgs } = await c.query(
      `select id from "Organization" where slug = 'demo'`,
    );
    const { rows: users } = await c.query(
      `select id, email from "User" where email in ('solicitante@demo.com','agente@demo.com')`,
    );
    const requester = users.find((u) => u.email === "solicitante@demo.com").id;
    const agent = users.find((u) => u.email === "agente@demo.com").id;

    const insert = (title: string, priority: string, assigneeId: string | null) =>
      c.query(
        `insert into "Ticket"
           (id, title, description, status, priority, "organizationId", "requesterId", "assigneeId", "updatedAt")
         values (gen_random_uuid()::text, $1, 'Chamado criado pelo teste automatizado.',
                 'OPEN', $2::"Priority", $3, $4, $5, now())`,
        [title, priority, orgs[0].id, requester, assigneeId],
      );

    await insert(T.drag, "MEDIUM", null);
    await insert(T.select, "MEDIUM", null);
    await insert(T.critical, "CRITICAL", null);
    await insert(T.low, "LOW", null);
    await insert(T.mine, "MEDIUM", agent);
  });
});

test.afterAll(async () => {
  await withDb((c) => c.query(`delete from "Ticket" where title like '[e2e] %'`));
});

test("solicitante não vê nem acessa o quadro", async ({ page }) => {
  await login(page, "solicitante@demo.com");
  await expect(page.getByRole("link", { name: "Quadro" })).toHaveCount(0);
  await page.goto("/tickets/board");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("agente vê as 5 colunas, com os mais urgentes primeiro", async ({ page }) => {
  await login(page, "agente@demo.com");
  await page.getByRole("link", { name: "Quadro" }).click();
  await expect(page).toHaveURL(/\/tickets\/board/);

  for (const status of ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]) {
    await expect(column(page, status)).toBeVisible();
  }

  // Dentro da coluna, prioridade crítica vem antes da baixa.
  await expect(cardIn(page, "OPEN", T.critical)).toBeVisible();
  const texts = await column(page, "OPEN").getByTestId("card").allInnerTexts();
  const critical = texts.findIndex((t) => t.includes(T.critical));
  const low = texts.findIndex((t) => t.includes(T.low));
  expect(critical).toBeGreaterThanOrEqual(0);
  expect(low).toBeGreaterThanOrEqual(0);
  expect(critical).toBeLessThan(low);
});

test("o quadro carrega sem erros de hidratação no navegador", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));

  await login(page, "agente@demo.com");
  await page.goto("/tickets/board");
  await expect(column(page, "OPEN")).toBeVisible();
  await page.waitForTimeout(1000); // dá tempo para a hidratação terminar

  const hydration = problems.filter((p) =>
    /hydrat|did not match|didn't match|DndDescribedBy/i.test(p),
  );
  expect(hydration).toEqual([]);
});

test("arrastar o card muda o status e persiste após recarregar", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  await page.goto("/tickets/board");
  await expect(cardIn(page, "OPEN", T.drag)).toBeVisible();

  await dragCardTo(page, T.drag, "IN_PROGRESS");

  await expect(cardIn(page, "IN_PROGRESS", T.drag)).toBeVisible();
  await expect(cardIn(page, "OPEN", T.drag)).toHaveCount(0);

  // Persistiu no banco: continua lá depois de recarregar.
  await page.reload();
  await expect(cardIn(page, "IN_PROGRESS", T.drag)).toBeVisible();

  // E o detalhe do chamado reflete o novo status.
  await card(page, T.drag).getByRole("link", { name: T.drag }).click();
  await expect(page.locator("header").getByText("Em andamento")).toBeVisible();
});

test("seletor 'Mover para' funciona; resolver preenche a data e reabrir limpa", async ({
  page,
}) => {
  const resolvedRow = (p: Page) =>
    p.locator("aside section").first().locator("div", { hasText: "Resolvido em" });

  await login(page, "agente@demo.com");
  await page.goto("/tickets/board");

  await card(page, T.select).getByRole("combobox").selectOption("RESOLVED");
  await expect(cardIn(page, "RESOLVED", T.select)).toBeVisible();

  await page.reload();
  await card(page, T.select).getByRole("link", { name: T.select }).click();
  await expect(resolvedRow(page)).not.toContainText("—");

  // Reabrir limpa a data de resolução.
  await page.goto("/tickets/board");
  await card(page, T.select).getByRole("combobox").selectOption("OPEN");
  await expect(cardIn(page, "OPEN", T.select)).toBeVisible();
  await page.reload();
  await card(page, T.select).getByRole("link", { name: T.select }).click();
  await expect(resolvedRow(page)).toContainText("—");
});

test("filtro 'Atribuídos a mim' mostra só os chamados do agente", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  await page.goto("/tickets/board?mine=1");

  await expect(card(page, T.mine)).toBeVisible();
  await expect(card(page, T.drag)).toHaveCount(0); // sem responsável
  await expect(card(page, T.low)).toHaveCount(0);

  await page.getByRole("link", { name: "Todos" }).click();
  await expect(card(page, T.drag)).toBeVisible();
});
