import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SLA,
  policiesFromRows,
  clockLabel,
  computeSla,
  formatDuration,
  summarizeSla,
  worstClock,
  type SlaPolicy,
  type SlaTicket,
} from "./sla";

const MIN = 60_000;
const T0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

// resposta em 60min, resolução em 8h (480min)
const policy: SlaPolicy = { responseMinutes: 60, resolutionMinutes: 480 };

const ticket = (over: Partial<SlaTicket> = {}): SlaTicket => ({
  createdAt: T0,
  priority: "MEDIUM",
  status: "OPEN",
  resolvedAt: null,
  firstResponseAt: null,
  slaPausedAt: null,
  slaPausedSeconds: 0,
  ...over,
});

describe("relógio de resposta", () => {
  it("está ok com folga", () => {
    const r = computeSla(ticket(), policy, at(10));
    assert.equal(r.response.state, "ok");
    assert.equal(r.response.remainingMs, 50 * MIN);
  });

  it("entra em risco quando restam 20% ou menos da meta", () => {
    // meta 60min => risco com <= 12min restantes
    assert.equal(computeSla(ticket(), policy, at(47)).response.state, "ok");
    assert.equal(computeSla(ticket(), policy, at(48)).response.state, "at_risk");
  });

  it("estoura depois do prazo e informa o atraso", () => {
    const r = computeSla(ticket(), policy, at(61));
    assert.equal(r.response.state, "breached");
    assert.equal(r.response.remainingMs, -1 * MIN);
  });

  it("fecha como cumprido ou estourado conforme a primeira resposta", () => {
    const early = ticket({ firstResponseAt: at(30) });
    const late = ticket({ firstResponseAt: at(90) });
    assert.equal(computeSla(early, policy, at(500)).response.state, "met");
    assert.equal(computeSla(late, policy, at(500)).response.state, "missed");
  });

  it("sem resposta, a resolução conta como resposta", () => {
    const t = ticket({ status: "RESOLVED", resolvedAt: at(20) });
    assert.equal(computeSla(t, policy, at(500)).response.state, "met");
  });

  it("não é afetado pela pausa em Aguardando", () => {
    const t = ticket({ slaPausedSeconds: 10 * 3600 });
    const r = computeSla(t, policy, at(30));
    assert.equal(r.response.dueAt.getTime(), at(60).getTime());
  });
});

describe("relógio de resolução", () => {
  it("segue ok, em risco e estoura", () => {
    // meta 480min => risco com <= 96min restantes
    assert.equal(computeSla(ticket(), policy, at(100)).resolution.state, "ok");
    assert.equal(computeSla(ticket(), policy, at(400)).resolution.state, "at_risk");
    const late = computeSla(ticket(), policy, at(481)).resolution;
    assert.equal(late.state, "breached");
    assert.equal(late.remainingMs, -1 * MIN);
  });

  it("congela o tempo restante enquanto está pausado", () => {
    const t = ticket({ status: "WAITING", slaPausedAt: at(100) });
    const a = computeSla(t, policy, at(700)).resolution;
    const b = computeSla(t, policy, at(5000)).resolution;
    assert.equal(a.state, "paused");
    assert.equal(a.remainingMs, 380 * MIN); // 480 - 100
    assert.equal(b.remainingMs, a.remainingMs); // não anda com o tempo
  });

  it("ao retomar, o tempo restante é igual ao que estava congelado", () => {
    // pausou aos 100min, ficou 600min parado e retomou aos 700min
    const paused = ticket({ status: "WAITING", slaPausedAt: at(100) });
    const resumed = ticket({ slaPausedSeconds: 600 * 60 });
    const frozen = computeSla(paused, policy, at(700)).resolution.remainingMs;
    const after = computeSla(resumed, policy, at(700)).resolution.remainingMs;
    assert.equal(after, frozen);
    assert.equal(after, 380 * MIN);
  });

  it("um chamado pausado por muito tempo não estoura", () => {
    const t = ticket({ status: "WAITING", slaPausedAt: at(100) });
    assert.notEqual(computeSla(t, policy, at(100000)).resolution.state, "breached");
  });

  it("resolvido: cumprido ou estourado, descontando o tempo pausado", () => {
    const late = ticket({ resolvedAt: at(1000), status: "RESOLVED" });
    const withPause = ticket({
      resolvedAt: at(1000),
      status: "RESOLVED",
      slaPausedSeconds: 600 * 60, // prazo vira 480 + 600 = 1080
    });
    assert.equal(computeSla(late, policy, at(2000)).resolution.state, "missed");
    assert.equal(computeSla(withPause, policy, at(2000)).resolution.state, "met");
  });

  it("recalcula ao trocar a prioridade (política diferente)", () => {
    const strict: SlaPolicy = { responseMinutes: 15, resolutionMinutes: 60 };
    const t = ticket();
    assert.equal(computeSla(t, policy, at(90)).resolution.state, "ok");
    assert.equal(computeSla(t, strict, at(90)).resolution.state, "breached");
  });
});

describe("worstClock", () => {
  it("usa a resposta enquanto ela ainda corre e é pior", () => {
    const r = computeSla(ticket(), policy, at(70)); // resposta estourada
    assert.equal(worstClock(r), r.response);
  });

  it("depois de respondido, vale a resolução", () => {
    const r = computeSla(ticket({ firstResponseAt: at(10) }), policy, at(70));
    assert.equal(worstClock(r), r.resolution);
  });
});

describe("formatação", () => {
  it("formatDuration", () => {
    assert.equal(formatDuration(30_000), "menos de 1min");
    assert.equal(formatDuration(45 * MIN), "45min");
    assert.equal(formatDuration(120 * MIN), "2h");
    assert.equal(formatDuration(125 * MIN), "2h 5min");
    assert.equal(formatDuration(24 * 60 * MIN), "1d");
    assert.equal(formatDuration(26 * 60 * MIN), "1d 2h");
    assert.equal(formatDuration(-125 * MIN), "2h 5min"); // sempre absoluto
  });

  it("clockLabel", () => {
    const r = (m: number, t = ticket()) => computeSla(t, policy, at(m));
    assert.equal(clockLabel(r(10).resolution), "Resta 7h 50min");
    assert.equal(clockLabel(r(500).resolution), "Estourado há 20min");
    assert.equal(
      clockLabel(r(700, ticket({ status: "WAITING", slaPausedAt: at(100) })).resolution),
      "Pausado (resta 6h 20min)",
    );
    assert.equal(
      clockLabel(computeSla(ticket({ resolvedAt: at(60) }), policy, at(70)).resolution),
      "Cumprido",
    );
  });

  it("pausado que já estava atrasado não diz que 'resta' tempo", () => {
    // pausou aos 500min, mas o prazo era 480min: já estava 20min atrasado
    const t = ticket({ status: "WAITING", slaPausedAt: at(500) });
    const c = computeSla(t, policy, at(900)).resolution;
    assert.equal(c.state, "paused");
    assert.equal(clockLabel(c), "Pausado (atrasado 20min)");
  });
});

describe("summarizeSla", () => {
  const policies = { ...DEFAULT_SLA, MEDIUM: policy };
  const now = at(1000);

  it("conta abertos, estourados, em risco e pausados", () => {
    const s = summarizeSla(
      [
        ticket({ firstResponseAt: at(5) }), // aberto, resolução em 480 => estourado aos 1000
        ticket({ createdAt: at(700), firstResponseAt: at(705) }), // ok
        ticket({ createdAt: at(300), firstResponseAt: at(305) }), // vence em 780 => estourado
        ticket({ status: "WAITING", slaPausedAt: at(100), firstResponseAt: at(5) }), // pausado
      ],
      policies,
      now,
    );
    assert.equal(s.open, 4);
    assert.equal(s.breached, 2);
    assert.equal(s.paused, 1);
  });

  it("calcula conformidade e médias dos concluídos na janela", () => {
    const ok = ticket({
      status: "RESOLVED",
      firstResponseAt: at(30),
      resolvedAt: at(200),
    });
    const bad = ticket({
      status: "RESOLVED",
      firstResponseAt: at(90), // resposta estourada
      resolvedAt: at(300),
    });
    const s = summarizeSla([ok, bad], policies, now);
    assert.equal(s.concluded, 2);
    assert.equal(s.compliancePct, 50);
    assert.equal(s.avgFirstResponseMs, 60 * MIN); // (30 + 90) / 2
    assert.equal(s.avgResolutionMs, 250 * MIN); // (200 + 300) / 2
  });

  it("ignora concluídos fora da janela e devolve null sem dados", () => {
    const old = ticket({
      status: "RESOLVED",
      resolvedAt: new Date(now.getTime() - 40 * 86_400_000),
    });
    const s = summarizeSla([old], policies, now);
    assert.equal(s.concluded, 0);
    assert.equal(s.compliancePct, null);
    assert.equal(s.avgResolutionMs, null);
  });

  it("o tempo médio de resolução desconta a pausa", () => {
    const t = ticket({
      status: "RESOLVED",
      firstResponseAt: at(10),
      resolvedAt: at(500),
      slaPausedSeconds: 200 * 60,
    });
    assert.equal(summarizeSla([t], policies, now).avgResolutionMs, 300 * MIN);
  });
});

describe("policiesFromRows", () => {
  it("sem registros, devolve o padrão", () => {
    assert.deepEqual(policiesFromRows([]), DEFAULT_SLA);
  });

  it("registros sobrescrevem só a prioridade informada; as outras seguem no padrão", () => {
    const p = policiesFromRows([
      { priority: "HIGH", responseMinutes: 5, resolutionMinutes: 30 },
    ]);
    assert.deepEqual(p.HIGH, { responseMinutes: 5, resolutionMinutes: 30 });
    assert.deepEqual(p.LOW, DEFAULT_SLA.LOW);
    assert.deepEqual(p.CRITICAL, DEFAULT_SLA.CRITICAL);
  });

  it("não altera o objeto padrão compartilhado", () => {
    const before = JSON.stringify(DEFAULT_SLA);
    policiesFromRows([{ priority: "LOW", responseMinutes: 1, resolutionMinutes: 2 }]);
    assert.equal(JSON.stringify(DEFAULT_SLA), before);
  });
});
