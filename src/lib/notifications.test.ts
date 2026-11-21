import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planAssignment, planComment, planRating, planStatusChange } from "./notifications";

const REQ = "req";
const AGENT = "agent";
const OTHER = "other";

describe("planAssignment", () => {
  it("avisa o novo responsável", () => {
    const out = planAssignment({ actorId: OTHER, newAssigneeId: AGENT, number: 7, title: "VPN" });
    assert.equal(out.length, 1);
    assert.equal(out[0].userId, AGENT);
    assert.equal(out[0].type, "ASSIGNED");
    assert.match(out[0].message, /#7.*VPN/);
  });

  it("não avisa quem se atribuiu o chamado nem remoção de responsável", () => {
    assert.deepEqual(
      planAssignment({ actorId: AGENT, newAssigneeId: AGENT, number: 1, title: "x" }),
      [],
    );
    assert.deepEqual(
      planAssignment({ actorId: AGENT, newAssigneeId: null, number: 1, title: "x" }),
      [],
    );
  });
});

describe("planStatusChange", () => {
  it("avisa o solicitante", () => {
    const out = planStatusChange({ actorId: AGENT, requesterId: REQ, number: 3, toLabel: "Resolvido" });
    assert.deepEqual(out.map((n) => n.userId), [REQ]);
    assert.match(out[0].message, /Resolvido/);
  });

  it("não avisa quando o próprio solicitante é quem mudou", () => {
    assert.deepEqual(
      planStatusChange({ actorId: REQ, requesterId: REQ, number: 3, toLabel: "x" }),
      [],
    );
  });
});

describe("planComment", () => {
  const base = { requesterId: REQ, number: 9, authorName: "Ana" };

  it("comentário público da equipe: avisa o solicitante e o responsável", () => {
    const out = planComment({ ...base, actorId: OTHER, assigneeId: AGENT, internal: false });
    assert.deepEqual(out.map((n) => n.userId).sort(), [AGENT, REQ]);
  });

  it("comentário do solicitante: avisa só o responsável", () => {
    const out = planComment({ ...base, actorId: REQ, assigneeId: AGENT, internal: false });
    assert.deepEqual(out.map((n) => n.userId), [AGENT]);
  });

  it("sem responsável, o solicitante comentando não avisa ninguém", () => {
    assert.deepEqual(
      planComment({ ...base, actorId: REQ, assigneeId: null, internal: false }),
      [],
    );
  });

  it("o responsável comentando avisa só o solicitante (sem auto-aviso)", () => {
    const out = planComment({ ...base, actorId: AGENT, assigneeId: AGENT, internal: false });
    assert.deepEqual(out.map((n) => n.userId), [REQ]);
  });

  it("nota interna NUNCA avisa o solicitante; avisa o responsável", () => {
    const out = planComment({ ...base, actorId: OTHER, assigneeId: AGENT, internal: true });
    assert.deepEqual(out.map((n) => n.userId), [AGENT]);
    assert.match(out[0].message, /nota interna/);
  });

  it("nota interna do próprio responsável não avisa ninguém", () => {
    assert.deepEqual(
      planComment({ ...base, actorId: AGENT, assigneeId: AGENT, internal: true }),
      [],
    );
  });
});

describe("planRating", () => {
  const base = { actorId: REQ, authorName: "Sara", number: 12, score: 2 };

  it("avisa o responsável com a nota", () => {
    const out = planRating({ ...base, assigneeId: AGENT, isUpdate: false });
    assert.equal(out.length, 1);
    assert.equal(out[0].userId, AGENT);
    assert.equal(out[0].type, "RATING");
    assert.match(out[0].message, /Sara avaliou o chamado #12: 2 de 5/);
  });

  it("muda o texto quando é uma alteração da avaliação", () => {
    const out = planRating({ ...base, assigneeId: AGENT, isUpdate: true });
    assert.match(out[0].message, /alterou a avaliação do chamado #12/);
  });

  it("sem responsável, ninguém é avisado", () => {
    assert.deepEqual(planRating({ ...base, assigneeId: null, isUpdate: false }), []);
  });

  it("não avisa quem se avaliou a si mesmo", () => {
    assert.deepEqual(planRating({ ...base, assigneeId: REQ, isUpdate: false }), []);
  });
});
