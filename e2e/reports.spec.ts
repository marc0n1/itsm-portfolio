import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const MARK = `e2e-csv-${stamp}`; // vai na descrição: é por ela que limpamos
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

const cleanup = () =>
  withDb((c) => c.query(`delete from "Ticket" where description like 'e2e-csv-%'`));

// Títulos de propósito hostis: fórmula, ponto e vírgula, aspas e quebra de linha.
const T_A = `Chamado normal ${stamp}`;
const T_B = `=HYPERLINK("http://evil.example";"clique") ${stamp}`;
// No CSV o título com fórmula sai com um apóstrofo na frente (vira texto no Excel).
const B_CELL = `'${T_B}`;
const T_C = `Erro; "grave"\nna segunda linha ${stamp}`;
const T_D = `Aguardando peça ${stamp}`;
const T_E = `Virada de mês ${stamp}`;
const T_F = `Primeiro de abril ${stamp}`;

type Seed = {
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  firstResponseAt?: string;
  resolvedAt?: string;
  paused?: number;
  createdAt: string;
};

/**
 * As colunas de data do Prisma são `timestamp` SEM fuso: o `pg` descartaria o
 * "-03:00" de um texto e gravaria a hora local como se fosse UTC. Por isso as
 * datas de apoio vão sempre em UTC (ISO com "Z").
 */
const utc = (iso?: string) => (iso ? new Date(iso).toISOString() : null);

// Datas em Brasília (-03:00).
const SEEDS: Seed[] = [
  { title: T_A, status: "RESOLVED", priority: "HIGH", assignee: "agente@demo.com",
    createdAt: "2026-03-10T10:00:00-03:00", firstResponseAt: "2026-03-10T10:30:00-03:00",
    resolvedAt: "2026-03-10T15:00:00-03:00", paused: 3600 },
  { title: T_B, status: "OPEN", priority: "MEDIUM", assignee: null, createdAt: "2026-03-12T09:00:00-03:00" },
  { title: T_C, status: "OPEN", priority: "LOW", assignee: null, createdAt: "2026-03-20T09:00:00-03:00" },
  { title: T_D, status: "WAITING", priority: "MEDIUM", assignee: "admin@demo.com", createdAt: "2026-04-05T09:00:00-03:00" },
  { title: T_E, status: "IN_PROGRESS", priority: "HIGH", assignee: "agente@demo.com", createdAt: "2026-03-31T23:30:00-03:00" },
  { title: T_F, status: "IN_PROGRESS", priority: "HIGH", assignee: "agente@demo.com", createdAt: "2026-04-01T00:10:00-03:00" },
];

let carlosId = "";

test.beforeAll(async () => {
  await cleanup();
  await withDb(async (c) => {
    const user = async (email: string) =>
      (await c.query(`select id, "organizationId" from "User" where email = $1`, [email])).rows[0];
    const requester = await user("solicitante@demo.com");
    carlosId = (await user("agente@demo.com")).id;

    for (const s of SEEDS) {
      const assignee = s.assignee ? (await user(s.assignee)).id : null;
      await c.query(
        `insert into "Ticket" (id, "organizationId", title, description, status, priority,
           "requesterId", "assigneeId", "firstResponseAt", "resolvedAt", "slaPausedSeconds", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5::"TicketStatus", $6::"Priority", $7, $8, $9, $10, $11, $12, now())`,
        [
          `e2ecsv${Math.random().toString(36).slice(2, 12)}`, requester.organizationId, s.title,
          MARK, s.status, s.priority, requester.id, assignee,
          utc(s.firstResponseAt), utc(s.resolvedAt), s.paused ?? 0, utc(s.createdAt),
        ],
      );
    }
  });
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

/** Leitor mínimo de CSV com ";" (respeita aspas, aspas duplicadas e quebras dentro de aspas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Baixa o CSV com os filtros dados (isolado pelo nosso marcador no título). */
async function exportCsv(page: Page, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ q: String(stamp), ...params });
  const res = await page.request.get(`/reports/export?${qs}`);
  const text = await res.text();
  return { res, text, rows: parseCsv(text.replace(BOM, "")) };
}

const body = (rows: string[][]) => rows.slice(1);
const titles = (rows: string[][]) => body(rows).map((r) => r[1]);

test("só a equipe acessa; solicitante e visitante não baixam", async ({ page, browser }) => {
  await loginAs(page, "solicitante@demo.com");
  await expect(page.getByRole("link", { name: "Relatórios" })).toHaveCount(0);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/dashboard/);
  expect((await page.request.get("/reports/export")).status()).toBe(403);

  const anon = await browser.newContext({ baseURL: "http://localhost:3000" });
  const res = await anon.request.get("/reports/export", { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(res.status());
  await anon.close();
});

test("o CSV tem BOM, cabeçalho em português, ';' e o nome do arquivo", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  const { res, text, rows } = await exportCsv(page);

  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="chamados_\d{4}-\d{2}-\d{2}\.csv"$/);
  expect(text.startsWith(BOM)).toBe(true);
  expect(rows[0].slice(0, 3)).toEqual(["Nº", "Título", "Status"]);
  expect(rows[0]).toHaveLength(14);
  // Todos os 6 chamados, em ordem cronológica, cada linha com as 14 colunas.
  expect(titles(rows)).toEqual([T_A, B_CELL, T_C, T_E, T_F, T_D]);
  for (const r of body(rows)) expect(r).toHaveLength(14);
});

test("as colunas trazem rótulos, datas de Brasília, tempos líquidos e SLA", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  const { rows } = await exportCsv(page, { status: "RESOLVED" });
  const [a] = body(rows);

  expect(a[1]).toBe(T_A);
  expect(a.slice(2, 4)).toEqual(["Resolvido", "Alta"]);
  expect(a[5]).toBe("Sara Solicitante");
  expect(a[6]).toBe("Carlos Agente");
  expect(a[7]).toBe("10/03/2026 10:00");
  expect(a[8]).toBe("10/03/2026 10:30");
  expect(a[9]).toBe("10/03/2026 15:00");
  expect(a[10]).toBe("30"); // minutos até a 1ª resposta
  expect(a[11]).toBe("240"); // 300 min corridos - 60 min pausado
  expect(a.slice(12)).toEqual(["Cumprido", "Cumprido"]);
});

test("texto hostil: fórmula é neutralizada; ';', aspas e quebra de linha fazem ida e volta", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  const { text, rows } = await exportCsv(page);

  // Fórmula: o título começa com apóstrofo, então o Excel o trata como texto.
  const b = body(rows).find((r) => r[1].includes("HYPERLINK"))!;
  expect(b[1]).toBe(B_CELL);
  expect(text).not.toMatch(/;=HYPERLINK|^=HYPERLINK/m);

  // Texto com ';', aspas e quebra de linha chega idêntico no parser.
  expect(titles(rows)).toContain(T_C);
});

test("filtros: status, prioridade, responsável (inclusive 'sem responsável') e busca", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");

  expect(titles((await exportCsv(page, { status: "OPEN" })).rows)).toEqual([B_CELL, T_C]);
  expect(titles((await exportCsv(page, { priority: "HIGH" })).rows)).toEqual([T_A, T_E, T_F]);
  expect(titles((await exportCsv(page, { assignee: "none" })).rows)).toEqual([B_CELL, T_C]);
  expect(titles((await exportCsv(page, { assignee: carlosId })).rows)).toEqual([T_A, T_E, T_F]);
  // Combinados (E é de Carlos, em andamento e de prioridade alta).
  expect(
    titles((await exportCsv(page, { assignee: carlosId, status: "IN_PROGRESS" })).rows),
  ).toEqual([T_E, T_F]);
  // Nada casa => só o cabeçalho.
  const none = await exportCsv(page, { status: "CLOSED" });
  expect(none.rows).toHaveLength(1);
});

test("período é inclusivo nas duas pontas e usa o horário de Brasília", async ({ page }) => {
  await loginAs(page, "agente@demo.com");

  // E foi aberto às 23:30 de 31/03 (02:30 UTC de 01/04): deve entrar em "até 31/03".
  expect(
    titles((await exportCsv(page, { from: "2026-03-01", to: "2026-03-31" })).rows),
  ).toEqual([T_A, B_CELL, T_C, T_E]);
  // F (00:10 de 01/04) só aparece a partir de 01/04.
  expect(titles((await exportCsv(page, { from: "2026-04-01" })).rows)).toEqual([T_F, T_D]);
  // Um único dia.
  expect(
    titles((await exportCsv(page, { from: "2026-03-31", to: "2026-03-31" })).rows),
  ).toEqual([T_E]);
});

test("parâmetros inválidos recebem 400 com a mensagem", async ({ page }) => {
  await loginAs(page, "agente@demo.com");

  for (const [params, message] of [
    [{ from: "2026-02-31" }, /Data inicial inválida/],
    [{ to: "31/03/2026" }, /Data final inválida/],
    [{ from: "2026-03-10", to: "2026-03-01" }, /inicial não pode ser depois/],
    [{ status: "NADA" }, /Status inválido/],
    [{ priority: "URGENTE" }, /Prioridade inválida/],
  ] as const) {
    const { res, text } = await exportCsv(page, params);
    expect(res.status(), JSON.stringify(params)).toBe(400);
    expect(text).toMatch(message);
  }
});

test("passou do limite: 413 no download e aviso na página", async ({ page }) => {
  const LIMIT_MARK = `e2e-csv-limit-${stamp}`;
  await withDb((c) =>
    c.query(
      `insert into "Ticket" (id, "organizationId", title, description, "requesterId", "createdAt", "updatedAt")
       select 'e2ecsvl' || md5(g::text || $1), u."organizationId", 'Volume ' || $1, $2, u.id, now(), now()
       from generate_series(1, 10001) g, "User" u where u.email = 'solicitante@demo.com'`,
      [String(stamp), LIMIT_MARK],
    ),
  );

  try {
    await loginAs(page, "agente@demo.com");
    const res = await page.request.get(`/reports/export?q=Volume%20${stamp}`);
    expect(res.status()).toBe(413);
    expect(await res.text()).toMatch(/limite por exportação é 10000/);

    await page.goto(`/reports?q=Volume%20${stamp}`);
    await expect(page.getByTestId("report-count")).toHaveText("10001");
    await expect(page.getByTestId("report-result").getByRole("alert")).toContainText("Acima do limite");
    await expect(page.getByRole("link", { name: "Baixar CSV" })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("pela tela: aplicar filtros mostra a contagem e o botão baixa o arquivo", async ({ page }) => {
  // O teste anterior apagou os chamados de apoio (cleanup): recria só o necessário.
  await withDb(async (c) => {
    const r = (await c.query(`select id, "organizationId" from "User" where email='solicitante@demo.com'`)).rows[0];
    await c.query(
      `insert into "Ticket" (id, "organizationId", title, description, "requesterId", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, now())`,
      [`e2ecsvui${stamp}`, r.organizationId, T_A, MARK, r.id, utc("2026-03-10T10:00:00-03:00")],
    );
  });

  await loginAs(page, "agente@demo.com");
  await page.getByRole("link", { name: "Relatórios" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Relatórios" })).toBeVisible();

  // exact: o rótulo "De" também casaria, por substring, com "Indicadores de SLA".
  await page.getByLabel("De", { exact: true }).fill("2026-03-01");
  await page.getByLabel("Até", { exact: true }).fill("2026-03-31");
  await page.getByLabel("Título ou nº").fill(String(stamp));
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  await expect(page).toHaveURL(/from=2026-03-01/);
  await expect(page.getByTestId("report-count")).toHaveText("1");
  await expect(page.getByTestId("report-result")).toContainText("com estes filtros");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("chamados_2026-03-01_a_2026-03-31.csv");
  const content = readFileSync((await download.path())!, "utf8");
  expect(content.startsWith(BOM)).toBe(true);
  expect(parseCsv(content.replace(BOM, ""))[1][1]).toBe(T_A);

  // Filtro inválido na URL: mensagem na tela, sem botão de download.
  await page.goto("/reports?from=2026-03-10&to=2026-03-01");
  await expect(page.locator("main p[role=alert], p[role=alert]")).toContainText("inicial não pode ser depois");
  await expect(page.getByRole("link", { name: "Baixar CSV" })).toHaveCount(0);
});

test("busca numérica grande demais não derruba a lista nem o relatório", async ({ page }) => {
  await loginAs(page, "agente@demo.com");

  // Antes, "99999999999" estourava o inteiro de 32 bits do Postgres (erro 500).
  await page.goto("/tickets?q=99999999999");
  await expect(page.getByText("Nenhum chamado encontrado com esses filtros.")).toBeVisible();

  const res = await page.request.get("/reports/export?q=99999999999");
  expect(res.status()).toBe(200);
  expect(parseCsv((await res.text()).replace(BOM, ""))).toHaveLength(1); // só o cabeçalho
});
