import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { diffTicket, type TicketSnapshot } from "./ticket-events";

const base: TicketSnapshot = { status: "OPEN", priority: "MEDIUM", assignee: null };

describe("diffTicket", () => {
  test("nada mudou => nenhum evento", () => {
    assert.deepEqual(diffTicket(base, { ...base }), []);
  });

  test("registra status, prioridade e responsável separadamente", () => {
    const events = diffTicket(base, {
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignee: "Carlos",
    });
    assert.deepEqual(events, [
      { type: "STATUS", from: "OPEN", to: "IN_PROGRESS" },
      { type: "PRIORITY", from: "MEDIUM", to: "HIGH" },
      { type: "ASSIGNEE", from: null, to: "Carlos" },
    ]);
  });

  test("remover o responsável vira evento com destino nulo", () => {
    const events = diffTicket({ ...base, assignee: "Ana" }, base);
    assert.deepEqual(events, [{ type: "ASSIGNEE", from: "Ana", to: null }]);
  });
});
