import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SlaTicket } from "./sla";
import { planSlaAlerts, slaAlertMessage, slaRecipients } from "./sla-alerts";

const MIN = 60_000;
const NOW = new Date("2026-11-20T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * MIN);

// Meta: 1ª resposta em 60 min; resolução em 8 h.
const policy = { responseMinutes: 60, resolutionMinutes: 8 * 60 };

function ticket(over: Partial<SlaTicket> = {}): SlaTicket {
  return {
    createdAt: ago(0),
    priority: "HIGH",
    status: "OPEN",
    resolvedAt: null,
    firstResponseAt: null,
    slaPausedAt: null,
    slaPausedSeconds: 0,
    ...over,
  };
}

describe("planSlaAlerts", () => {
  it("chamado novo e dentro do prazo: nenhum alerta", () => {
    assert.deepEqual(planSlaAlerts(ticket({ createdAt: ago(5) }), policy, NOW), []);
  });

  it("restam 20% ou menos da meta de resposta: alerta 'em risco'", () => {
    // 60 min de meta: risco a partir de 48 min decorridos (restam 12 = 20%).
    const out = planSlaAlerts(ticket({ createdAt: ago(50) }), policy, NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0].clock, "RESPONSE");
    assert.equal(out[0].state, "AT_RISK");
    assert.equal(out[0].remainingMs, 10 * MIN);
  });

  it("logo antes do limiar de 20% ainda não alerta", () => {
    assert.deepEqual(planSlaAlerts(ticket({ createdAt: ago(47) }), policy, NOW), []);
  });

  it("prazo de resposta vencido: alerta 'estourado' com atraso negativo", () => {
    const out = planSlaAlerts(ticket({ createdAt: ago(90) }), policy, NOW);
    const response = out.find((a) => a.clock === "RESPONSE")!;
    assert.equal(response.state, "BREACHED");
    assert.equal(response.remainingMs, -30 * MIN);
    assert.equal(response.dueAt.getTime(), ago(90).getTime() + 60 * MIN);
  });

  it("a resolução tem o seu próprio alerta, independente da resposta", () => {
    // Respondido, mas já em 7h de 8h de resolução (restam 60 min <= 96 min).
    const out = planSlaAlerts(
      ticket({ createdAt: ago(7 * 60), firstResponseAt: ago(7 * 60 - 10) }),
      policy,
      NOW,
    );
    assert.deepEqual(out.map((a) => [a.clock, a.state]), [["RESOLUTION", "AT_RISK"]]);
  });

  it("os dois relógios podem alertar ao mesmo tempo", () => {
    const out = planSlaAlerts(ticket({ createdAt: ago(9 * 60) }), policy, NOW);
    assert.deepEqual(
      out.map((a) => [a.clock, a.state]),
      [["RESPONSE", "BREACHED"], ["RESOLUTION", "BREACHED"]],
    );
  });

  it("resposta já dada: não alerta a resposta", () => {
    const out = planSlaAlerts(
      ticket({ createdAt: ago(90), firstResponseAt: ago(80) }),
      policy,
      NOW,
    );
    assert.equal(out.find((a) => a.clock === "RESPONSE"), undefined);
  });

  it("chamado resolvido: nenhum alerta, mesmo que tenha atrasado", () => {
    const out = planSlaAlerts(
      ticket({ createdAt: ago(9 * 60), resolvedAt: ago(1), firstResponseAt: ago(300) }),
      policy,
      NOW,
    );
    assert.deepEqual(out, []);
  });

  it("resolução PAUSADA em 'Aguardando' não alerta a resolução", () => {
    const out = planSlaAlerts(
      ticket({
        createdAt: ago(7 * 60 + 30),
        firstResponseAt: ago(7 * 60),
        slaPausedAt: ago(20),
        status: "WAITING",
      }),
      policy,
      NOW,
    );
    assert.equal(out.find((a) => a.clock === "RESOLUTION"), undefined);
  });

  it("o tempo já pausado empurra o prazo: sem alerta onde o relógio ainda tem folga", () => {
    // 7h30 decorridos, mas 2h pausadas => prazo de resolução em 10h.
    const out = planSlaAlerts(
      ticket({ createdAt: ago(7 * 60 + 30), firstResponseAt: ago(7 * 60), slaPausedSeconds: 2 * 3600 }),
      policy,
      NOW,
    );
    assert.deepEqual(out, []);
  });

  it("o prazo (dueAt) é estável entre execuções, base da idempotência", () => {
    const t = ticket({ createdAt: ago(50) });
    const a = planSlaAlerts(t, policy, NOW)[0];
    const b = planSlaAlerts(t, policy, new Date(NOW.getTime() + 2 * MIN))[0];
    assert.equal(a.dueAt.getTime(), b.dueAt.getTime());
  });
});

describe("slaRecipients", () => {
  const staff = [
    { id: "ana", role: "ADMIN" as const },
    { id: "carlos", role: "AGENT" as const },
    { id: "bia", role: "AGENT" as const },
  ];

  it("em risco com responsável: só ele", () => {
    assert.deepEqual(slaRecipients({ state: "AT_RISK", assigneeId: "carlos", staff }), ["carlos"]);
  });

  it("estourado com responsável: ele e os administradores (sem repetir)", () => {
    assert.deepEqual(
      slaRecipients({ state: "BREACHED", assigneeId: "carlos", staff }).sort(),
      ["ana", "carlos"],
    );
    // Responsável que já é admin: uma vez só.
    assert.deepEqual(slaRecipients({ state: "BREACHED", assigneeId: "ana", staff }), ["ana"]);
  });

  it("sem responsável: toda a equipe ativa", () => {
    for (const state of ["AT_RISK", "BREACHED"] as const) {
      assert.deepEqual(
        slaRecipients({ state, assigneeId: null, staff }).sort(),
        ["ana", "bia", "carlos"],
      );
    }
  });

  it("responsável desativado (fora da equipe ativa) conta como sem responsável", () => {
    assert.deepEqual(
      slaRecipients({ state: "AT_RISK", assigneeId: "saiu", staff }).sort(),
      ["ana", "bia", "carlos"],
    );
  });

  it("equipe vazia: ninguém", () => {
    assert.deepEqual(slaRecipients({ state: "AT_RISK", assigneeId: null, staff: [] }), []);
  });
});

describe("slaAlertMessage", () => {
  it("em risco informa quanto resta", () => {
    assert.equal(
      slaAlertMessage({ number: 12, clock: "RESPONSE", state: "AT_RISK", remainingMs: 12 * MIN }),
      "Chamado #12: prazo da primeira resposta em risco (restam 12min)",
    );
  });

  it("estourado informa há quanto tempo, sempre positivo", () => {
    assert.equal(
      slaAlertMessage({ number: 3, clock: "RESOLUTION", state: "BREACHED", remainingMs: -125 * MIN }),
      "Chamado #3: prazo da resolução estourado (há 2h 5min)",
    );
  });
});
