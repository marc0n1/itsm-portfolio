import "dotenv/config";
import { execSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { DEFAULT_SLA } from "../src/lib/sla";

const PASSWORD = "demo1234";
const stamp = Date.now();
const SECRET = process.env.CRON_SECRET;
const MIN = 60_000;

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

test.beforeAll(async () => {
  test.skip(!SECRET, "CRON_SECRET não definido no ambiente");
  await cleanup();
});
test.afterAll(cleanup);
test.describe.configure({ mode: "serial" });

type Ids = Record<"carlos" | "ana" | "sara" | "org", string>;
let ids: Ids;
const tickets: Record<string, { id: string; number: number }> = {};

/** Metas em vigor da prioridade CRITICAL (o que o admin configurou, ou o padrão). */
async function criticalPolicy(c: Client) {
  const row = (
    await c.query(
      `select "responseMinutes" as r, "resolutionMinutes" as s from "SlaPolicy" p
       join "User" u on u."organizationId" = p."organizationId" and u.email = 'admin@demo.com'
       where p.priority = 'CRITICAL'`,
    )
  ).rows[0];
  return row
    ? { response: row.r as number, resolution: row.s as number }
    : { response: DEFAULT_SLA.CRITICAL.responseMinutes, resolution: DEFAULT_SLA.CRITICAL.resolutionMinutes };
}

type Seed = {
  key: string;
  assignee: "carlos" | null;
  /** Minutos atrás em que o chamado foi criado. */
  createdMinutesAgo: number;
  firstResponseMinutesAfter?: number;
  paused?: boolean;
  resolved?: boolean;
};

async function insertTicket(c: Client, s: Seed) {
  const created = new Date(Date.now() - s.createdMinutesAgo * MIN);
  const at = (minutes?: number) =>
    minutes === undefined ? null : new Date(created.getTime() + minutes * MIN).toISOString();
  const id = `e2esla${s.key}${Math.random().toString(36).slice(2, 10)}`;
  const row = (
    await c.query(
      `insert into "Ticket" (id, "organizationId", title, description, status, priority, "requesterId",
         "assigneeId", "firstResponseAt", "slaPausedAt", "resolvedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, 'Descrição de teste de alerta de SLA', $4::"TicketStatus", 'CRITICAL', $5,
         $6, $7, $8, $9, $10, now())
       returning id, number`,
      [
        id, ids.org, `[e2e] SLA ${stamp} ${s.key}`,
        s.resolved ? "RESOLVED" : s.paused ? "WAITING" : "OPEN",
        ids.sara, s.assignee ? ids[s.assignee] : null,
        at(s.firstResponseMinutesAfter),
        s.paused ? new Date(Date.now() - 5 * MIN).toISOString() : null,
        s.resolved ? new Date(Date.now() - 2 * MIN).toISOString() : null,
        created.toISOString(),
      ],
    )
  ).rows[0];
  tickets[s.key] = { id: row.id, number: row.number };
}

async function runJob(request: APIRequestContext, secret = SECRET) {
  return request.get("/api/cron/sla", {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

/** Notificações de SLA de um chamado: [e-mail do destinatário, mensagem]. */
async function slaNotices(key: string) {
  return withDb(async (c) =>
    (
      await c.query(
        `select u.email, n.message from "Notification" n join "User" u on u.id = n.\"userId\"
         where n."ticketId" = $1 and n.type = 'SLA' order by u.email, n."createdAt"`,
        [tickets[key].id],
      )
    ).rows as { email: string; message: string }[],
  );
}

const alertCount = (key: string) =>
  withDb(async (c) =>
    Number((await c.query(`select count(*) from "SlaAlert" where "ticketId" = $1`, [tickets[key].id])).rows[0].count),
  );

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a rota exige o segredo: sem ele ou com segredo errado, 401", async ({ request }) => {
  expect((await runJob(request, "")).status()).toBe(401);
  const wrong = await runJob(request, "segredo-errado");
  expect(wrong.status()).toBe(401);
  expect(wrong.headers()["www-authenticate"]).toBe("Bearer");
  // Cabeçalho em outro formato também é negado.
  const basic = await request.get("/api/cron/sla", { headers: { Authorization: `Basic ${SECRET}` } });
  expect(basic.status()).toBe(401);
});

test("monta os chamados de cada cenário", async () => {
  await withDb(async (c) => {
    const user = async (email: string) =>
      (await c.query(`select id, "organizationId" from "User" where email = $1`, [email])).rows[0];
    // Em sequência: um mesmo cliente do pg não aceita consultas concorrentes.
    const carlos = await user("agente@demo.com");
    const ana = await user("admin@demo.com");
    const sara = await user("solicitante@demo.com");
    ids = { carlos: carlos.id, ana: ana.id, sara: sara.id, org: sara.organizationId };

    const p = await criticalPolicy(c);
    const risk = p.response * 0.9; // restam 10% da meta de resposta (<= 20%)
    const late = p.response * 2; // o dobro da meta: estourado
    const resRisk = p.resolution * 0.9;

    await insertTicket(c, { key: "A-risco-com-dono", assignee: "carlos", createdMinutesAgo: risk });
    await insertTicket(c, { key: "B-estourado-sem-dono", assignee: null, createdMinutesAgo: late });
    await insertTicket(c, { key: "C-estourado-com-dono", assignee: "carlos", createdMinutesAgo: late });
    await insertTicket(c, {
      key: "D-resolucao-em-risco", assignee: "carlos", createdMinutesAgo: resRisk, firstResponseMinutesAfter: 5,
    });
    await insertTicket(c, {
      key: "E-pausado", assignee: "carlos", createdMinutesAgo: resRisk, firstResponseMinutesAfter: 5, paused: true,
    });
    await insertTicket(c, { key: "F-resolvido", assignee: "carlos", createdMinutesAgo: late, resolved: true });
    await insertTicket(c, { key: "G-novo", assignee: "carlos", createdMinutesAgo: 1 });
  });
  expect(Object.keys(tickets)).toHaveLength(7);
});

test("a primeira execução avisa as pessoas certas, com o texto certo", async ({ request }) => {
  const res = await runJob(request);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.checked).toBeGreaterThanOrEqual(7);
  expect(body.alerts).toBeGreaterThanOrEqual(4);
  expect(res.headers()["cache-control"]).toContain("no-store");

  // A: em risco, com responsável => só o responsável.
  const a = await slaNotices("A-risco-com-dono");
  expect(a.map((n) => n.email)).toEqual(["agente@demo.com"]);
  expect(a[0].message).toMatch(new RegExp(`Chamado #${tickets["A-risco-com-dono"].number}: prazo da primeira resposta em risco \\(restam `));

  // B: estourado, sem responsável => toda a equipe ativa.
  const b = await slaNotices("B-estourado-sem-dono");
  expect(b.map((n) => n.email)).toEqual(expect.arrayContaining(["admin@demo.com", "agente@demo.com"]));
  expect(b.every((n) => /primeira resposta estourado \(há /.test(n.message))).toBe(true);

  // C: estourado, com responsável => ele + os administradores (escalonamento).
  const c = await slaNotices("C-estourado-com-dono");
  expect(c.map((n) => n.email).sort()).toEqual(["admin@demo.com", "agente@demo.com"]);

  // D: só o relógio de RESOLUÇÃO (a resposta foi dada).
  const d = await slaNotices("D-resolucao-em-risco");
  expect(d.map((n) => n.email)).toEqual(["agente@demo.com"]);
  expect(d[0].message).toContain("prazo da resolução em risco");

  // E (pausado), F (resolvido) e G (novo): nada.
  for (const key of ["E-pausado", "F-resolvido", "G-novo"]) {
    expect(await slaNotices(key), key).toEqual([]);
    expect(await alertCount(key), key).toBe(0);
  }
});

test("rodar de novo NÃO repete os avisos (idempotente), nem rodando em paralelo", async ({ request }) => {
  const before = await Promise.all(Object.keys(tickets).map(async (k) => [k, (await slaNotices(k)).length] as const));

  expect((await runJob(request)).status()).toBe(200);
  // Duas execuções simultâneas também não duplicam.
  const [r1, r2] = await Promise.all([runJob(request), runJob(request)]);
  expect([r1.status(), r2.status()]).toEqual([200, 200]);

  for (const [key, count] of before) {
    expect((await slaNotices(key)).length, key).toBe(count);
  }
});

test("corrida real: dois disparos simultâneos num chamado novo avisam cada pessoa uma vez só", async ({
  request,
}) => {
  await withDb((c) =>
    insertTicket(c, { key: "H-corrida", assignee: null, createdMinutesAgo: 600 /* bem estourado */ }),
  );
  const results = await Promise.all([runJob(request), runJob(request), runJob(request)]);
  expect(results.map((r) => r.status())).toEqual([200, 200, 200]);

  const notices = await slaNotices("H-corrida");
  // Sem responsável: toda a equipe, UMA vez cada (por relógio estourado).
  const perUser = new Map<string, number>();
  for (const n of notices) perUser.set(n.email, (perUser.get(n.email) ?? 0) + 1);
  const counts = [...perUser.values()];
  expect(counts.length).toBeGreaterThanOrEqual(2);
  // Resposta e resolução estouradas => no máximo 2 avisos por pessoa, nunca 6.
  expect(Math.max(...counts)).toBeLessThanOrEqual(2);
  expect(await alertCount("H-corrida")).toBe(2); // 1 por relógio
});

test("quando o estado piora (em risco -> estourado), um NOVO aviso é enviado", async ({ request }) => {
  const key = "A-risco-com-dono";
  expect(await alertCount(key)).toBe(1);

  // O tempo passa: o prazo de resposta de A vence.
  await withDb((c) =>
    c.query(`update "Ticket" set "createdAt" = now() - interval '3 hours' where id = $1`, [tickets[key].id]),
  );
  expect((await runJob(request)).status()).toBe(200);

  const notices = await slaNotices(key);
  const estourados = notices.filter((n) => n.message.includes("estourado"));
  expect(estourados.map((n) => n.email).sort()).toEqual(
    expect.arrayContaining(["admin@demo.com", "agente@demo.com"]),
  );
  // Continua existindo o aviso antigo de "em risco" (histórico), e o novo foi acrescentado.
  expect(notices.some((n) => n.message.includes("em risco"))).toBe(true);
  expect(await alertCount(key)).toBeGreaterThanOrEqual(2);
});

test("o responsável vê o aviso no sino e ele leva ao chamado", async ({ page }) => {
  await loginAs(page, "agente@demo.com");
  await page.getByRole("button", { name: /^Notificações/ }).click();
  const panel = page.getByTestId("notifications-panel");

  const number = tickets["D-resolucao-em-risco"].number;
  const item = panel.getByRole("button", {
    name: new RegExp(`Chamado #${number}: prazo da resolução em risco`),
  });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("data-unread", "true");
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${tickets["D-resolucao-em-risco"].id}$`));
});

test("o comando 'npm run sla:check' roda fora do servidor e também é idempotente", async () => {
  const before = (await slaNotices("B-estourado-sem-dono")).length;
  const out = execSync("npm run sla:check --silent", { encoding: "utf8", env: process.env });
  expect(out).toMatch(/SLA: \d+ chamado\(s\) em aberto examinado\(s\), \d+ alerta\(s\) novo\(s\), \d+ notificação\(ões\)\./);
  expect((await slaNotices("B-estourado-sem-dono")).length).toBe(before);
});
