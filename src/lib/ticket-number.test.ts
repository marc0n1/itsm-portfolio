import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ticketNumberFromQuery } from "./tickets";

describe("ticketNumberFromQuery", () => {
  it("reconhece '42' e '#42' como número de chamado", () => {
    assert.equal(ticketNumberFromQuery("42"), 42);
    assert.equal(ticketNumberFromQuery("#42"), 42);
    assert.equal(ticketNumberFromQuery("007"), 7);
  });

  it("texto comum não é número", () => {
    for (const q of ["vpn", "42a", "#", "", "4 2", "-5", "1.5", "##3"]) {
      assert.equal(ticketNumberFromQuery(q), null, q);
    }
  });

  it("zero não é um número de chamado válido", () => {
    assert.equal(ticketNumberFromQuery("0"), null);
  });

  it("aceita até o maior inteiro de 32 bits; acima disso estouraria o banco", () => {
    assert.equal(ticketNumberFromQuery("2147483647"), 2147483647);
    assert.equal(ticketNumberFromQuery("2147483648"), null);
    assert.equal(ticketNumberFromQuery("99999999999"), null);
    assert.equal(ticketNumberFromQuery("1763000000000"), null);
  });
});
