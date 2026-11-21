import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRate, ratingSchema, stars, summarizeCsat } from "./csat";

describe("ratingSchema", () => {
  const ok = { ticketId: "t1", score: "4", comment: "  Rápido e educado.  " };

  it("aceita notas de 1 a 5 e converte para número; apara o comentário", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const r = ratingSchema.safeParse({ ...ok, score: String(n) });
      assert.ok(r.success);
      assert.equal(r.data.score, n);
    }
    const r = ratingSchema.safeParse(ok);
    assert.ok(r.success);
    assert.equal(r.data.comment, "Rápido e educado.");
  });

  it("recusa nota fora do intervalo, decimal, vazia ou ausente", () => {
    for (const bad of ["0", "6", "-1", "3.5", "", "abc", "10", " 4"]) {
      const r = ratingSchema.safeParse({ ...ok, score: bad });
      assert.equal(r.success, false, bad);
    }
    assert.equal(ratingSchema.safeParse({ ticketId: "t1" }).success, false);
  });

  it("a mensagem de nota inválida é em português", () => {
    const r = ratingSchema.safeParse({ ...ok, score: "9" });
    assert.ok(!r.success);
    assert.equal(r.error.issues[0].message, "Escolha uma nota de 1 a 5.");
    const missing = ratingSchema.safeParse({ ticketId: "t1" });
    assert.ok(!missing.success);
    assert.equal(missing.error.issues[0].message, "Escolha uma nota de 1 a 5.");
  });

  it("comentário em branco ou ausente vira null; acima de 1000 é recusado", () => {
    const blank = ratingSchema.safeParse({ ...ok, comment: "   " });
    assert.ok(blank.success);
    assert.equal(blank.data.comment, null);
    const none = ratingSchema.safeParse({ ticketId: "t1", score: "5" });
    assert.ok(none.success);
    assert.equal(none.data.comment, null);
    assert.equal(ratingSchema.safeParse({ ...ok, comment: "a".repeat(1001) }).success, false);
    assert.equal(ratingSchema.safeParse({ ...ok, comment: "a".repeat(1000) }).success, true);
  });
});

describe("canRate", () => {
  it("só o solicitante, e só com o chamado concluído", () => {
    assert.equal(canRate({ status: "RESOLVED", requesterId: "u1" }, "u1"), true);
    assert.equal(canRate({ status: "CLOSED", requesterId: "u1" }, "u1"), true);
    for (const status of ["OPEN", "IN_PROGRESS", "WAITING"] as const) {
      assert.equal(canRate({ status, requesterId: "u1" }, "u1"), false, status);
    }
  });

  it("outra pessoa (inclusive a equipe) não avalia", () => {
    assert.equal(canRate({ status: "RESOLVED", requesterId: "u1" }, "agente"), false);
  });
});

describe("stars", () => {
  it("mostra a nota em estrelas cheias e vazias", () => {
    assert.equal(stars(5), "★★★★★");
    assert.equal(stars(3), "★★★☆☆");
    assert.equal(stars(1), "★☆☆☆☆");
  });

  it("valores fora do intervalo são limitados", () => {
    assert.equal(stars(9), "★★★★★");
    assert.equal(stars(-2), "☆☆☆☆☆");
  });
});

describe("summarizeCsat", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it("sem chamados concluídos: tudo nulo", () => {
    const s = summarizeCsat([], now);
    assert.deepEqual(
      [s.concluded, s.rated, s.average, s.satisfiedPct, s.responseRatePct],
      [0, 0, null, null, null],
    );
  });

  it("concluídos sem avaliação: taxa de resposta 0%, sem média", () => {
    const s = summarizeCsat([{ resolvedAt: daysAgo(2), csatScore: null }], now);
    assert.equal(s.concluded, 1);
    assert.equal(s.rated, 0);
    assert.equal(s.average, null);
    assert.equal(s.satisfiedPct, null);
    assert.equal(s.responseRatePct, 0);
  });

  it("calcula média, % satisfeitos (4 e 5), taxa de resposta e distribuição", () => {
    const s = summarizeCsat(
      [
        { resolvedAt: daysAgo(1), csatScore: 5 },
        { resolvedAt: daysAgo(2), csatScore: 4 },
        { resolvedAt: daysAgo(3), csatScore: 3 },
        { resolvedAt: daysAgo(4), csatScore: 1 },
        { resolvedAt: daysAgo(5), csatScore: null },
      ],
      now,
    );
    assert.equal(s.concluded, 5);
    assert.equal(s.rated, 4);
    assert.equal(s.average, 3.3); // (5+4+3+1)/4 = 3,25 -> 3,3
    assert.equal(s.satisfiedPct, 50); // 2 de 4
    assert.equal(s.responseRatePct, 80); // 4 de 5
    assert.deepEqual(s.distribution, [1, 0, 1, 1, 1]);
  });

  it("ignora chamados fora da janela e os ainda não resolvidos", () => {
    const s = summarizeCsat(
      [
        { resolvedAt: daysAgo(31), csatScore: 1 }, // fora da janela de 30 dias
        { resolvedAt: null, csatScore: 5 }, // nunca resolvido
        { resolvedAt: daysAgo(10), csatScore: 5 },
      ],
      now,
    );
    assert.equal(s.concluded, 1);
    assert.equal(s.average, 5);
    assert.equal(s.satisfiedPct, 100);
  });

  it("respeita uma janela customizada", () => {
    const tickets = [{ resolvedAt: daysAgo(10), csatScore: 5 }];
    assert.equal(summarizeCsat(tickets, now, 7).concluded, 0);
    assert.equal(summarizeCsat(tickets, now, 30).concluded, 1);
  });
});
