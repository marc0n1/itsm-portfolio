import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CSV_HEADERS,
  csvDate,
  dateRange,
  parseReportFilters,
  reportFilename,
  reportQuery,
  ticketCsvRow,
  type ReportTicket,
} from "./reports";

const q = (s: string) => new URLSearchParams(s);

describe("parseReportFilters", () => {
  it("campos vazios do formulário viram 'sem filtro'", () => {
    const r = parseReportFilters(q("q=&status=&priority=&assignee=&from=&to="));
    assert.ok("filters" in r);
    assert.deepEqual(r.filters, {});
  });

  it("aceita filtros válidos e apara a busca", () => {
    const r = parseReportFilters(
      q("q=%20vpn%20&status=OPEN&priority=HIGH&assignee=none&from=2026-03-01&to=2026-03-31"),
    );
    assert.ok("filters" in r);
    assert.deepEqual(r.filters, {
      q: "vpn", status: "OPEN", priority: "HIGH", assignee: "none", from: "2026-03-01", to: "2026-03-31",
    });
  });

  it("recusa status e prioridade inexistentes", () => {
    assert.ok("error" in parseReportFilters(q("status=NADA")));
    assert.ok("error" in parseReportFilters(q("priority=URGENTE")));
  });

  it("recusa datas mal formadas e dias que não existem", () => {
    for (const bad of ["01/03/2026", "2026-3-1", "2026-02-31", "2026-13-01", "abc"]) {
      assert.ok("error" in parseReportFilters(q(`from=${encodeURIComponent(bad)}`)), bad);
    }
  });

  it("a mensagem de data inválida é em português e diz qual ponta errou", () => {
    const from = parseReportFilters(q("from=2026-02-31"));
    assert.ok("error" in from);
    assert.equal(from.error, "Data inicial inválida.");
    const to = parseReportFilters(q("to=31/03/2026"));
    assert.ok("error" in to);
    assert.equal(to.error, "Data final inválida.");
  });

  it("recusa período invertido, mas aceita o mesmo dia", () => {
    const r = parseReportFilters(q("from=2026-03-10&to=2026-03-01"));
    assert.ok("error" in r);
    assert.match(r.error, /inicial não pode ser depois/);
    assert.ok("filters" in parseReportFilters(q("from=2026-03-10&to=2026-03-10")));
  });

  it("aceita objeto de searchParams do Next (valor único ou lista)", () => {
    const r = parseReportFilters({ status: ["OPEN", "CLOSED"], q: undefined });
    assert.ok("filters" in r);
    assert.equal(r.filters.status, "OPEN");
  });
});

describe("dateRange", () => {
  it("é inclusivo nas duas pontas, em horário de Brasília", () => {
    const r = dateRange("2026-03-01", "2026-03-31");
    assert.equal(r.gte?.toISOString(), "2026-03-01T03:00:00.000Z");
    // fim exclusivo = 01/04 00:00 em Brasília
    assert.equal(r.lt?.toISOString(), "2026-04-01T03:00:00.000Z");
  });

  it("cruza mês e ano no limite superior", () => {
    assert.equal(dateRange(undefined, "2026-12-31").lt?.toISOString(), "2027-01-01T03:00:00.000Z");
  });

  it("pode ter só uma ponta, ou nenhuma", () => {
    assert.deepEqual(Object.keys(dateRange("2026-03-01")), ["gte"]);
    assert.deepEqual(Object.keys(dateRange(undefined, "2026-03-01")), ["lt"]);
    assert.deepEqual(dateRange(), {});
  });
});

describe("reportQuery / reportFilename", () => {
  it("monta a querystring só com o que está preenchido", () => {
    assert.equal(reportQuery({}), "");
    assert.equal(
      reportQuery({ q: "a b", status: "OPEN", from: "2026-03-01" }),
      "q=a+b&status=OPEN&from=2026-03-01",
    );
  });

  it("nome do arquivo usa o período ou a data de hoje (Brasília)", () => {
    const now = new Date("2026-03-15T01:00:00Z"); // ainda 14/03 em Brasília
    assert.equal(reportFilename({}, now), "chamados_2026-03-14.csv");
    assert.equal(
      reportFilename({ from: "2026-03-01", to: "2026-03-31" }, now),
      "chamados_2026-03-01_a_2026-03-31.csv",
    );
    assert.equal(reportFilename({ from: "2026-03-01" }, now), "chamados_2026-03-01_a_hoje.csv");
  });
});

describe("csvDate", () => {
  it("formata dd/MM/yyyy HH:mm em Brasília; vazio quando não há data", () => {
    assert.equal(csvDate(new Date("2026-03-10T13:05:00Z")), "10/03/2026 10:05");
    assert.equal(csvDate(new Date("2026-01-01T02:59:00Z")), "31/12/2025 23:59");
    assert.equal(csvDate(null), "");
  });
});

describe("ticketCsvRow", () => {
  const policy = { responseMinutes: 60, resolutionMinutes: 8 * 60 };
  const base: ReportTicket = {
    number: 7,
    title: "VPN caiu",
    status: "RESOLVED",
    priority: "HIGH",
    service: { name: "Rede" },
    requester: { name: "Sara" },
    assignee: { name: "Carlos" },
    createdAt: new Date("2026-03-10T13:00:00Z"),
    firstResponseAt: new Date("2026-03-10T13:30:00Z"),
    resolvedAt: new Date("2026-03-10T18:00:00Z"),
    slaPausedAt: null,
    slaPausedSeconds: 3600,
    csatScore: 5,
    csatComment: "Atendimento rápido",
  };
  const now = new Date("2026-04-01T00:00:00Z");

  it("tem uma célula para cada coluna do cabeçalho", () => {
    assert.equal(ticketCsvRow(base, policy, now).length, CSV_HEADERS.length);
  });

  it("chamado resolvido: tempos, rótulos e SLA cumprido", () => {
    assert.deepEqual(ticketCsvRow(base, policy, now), [
      7, "VPN caiu", "Resolvido", "Alta", "Rede", "Sara", "Carlos",
      "10/03/2026 10:00", "10/03/2026 10:30", "10/03/2026 15:00",
      30,
      // 5h corridas (300 min) - 1h pausado = 240
      240,
      "Cumprido", "Cumprido",
      5, "Atendimento rápido",
    ]);
  });

  it("chamado aberto: campos vazios, SLA conforme o relógio", () => {
    const open: ReportTicket = {
      ...base,
      status: "OPEN",
      assignee: null,
      service: null,
      firstResponseAt: null,
      resolvedAt: null,
      slaPausedSeconds: 0,
      csatScore: null,
      csatComment: null,
    };
    const row = ticketCsvRow(open, policy, now);
    assert.equal(row[4], ""); // serviço
    assert.equal(row[6], ""); // responsável
    assert.equal(row[8], ""); // 1ª resposta
    assert.equal(row[9], ""); // resolvido
    assert.equal(row[10], null);
    assert.equal(row[11], null);
    // 'now' muito depois dos prazos: ambos estourados.
    assert.equal(row[12], "Estourado");
    assert.equal(row[13], "Estourado");
    assert.equal(row[14], null); // sem avaliação
    assert.equal(row[15], null);
  });

  it("SLA não cumprido quando concluiu depois do prazo", () => {
    const late: ReportTicket = {
      ...base,
      firstResponseAt: new Date("2026-03-10T15:00:00Z"), // 2h > meta de 1h
      slaPausedSeconds: 0,
    };
    assert.equal(ticketCsvRow(late, policy, now)[12], "Não cumprido");
  });
});
