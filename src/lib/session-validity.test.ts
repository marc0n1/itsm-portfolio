import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSessionStale } from "./session-validity";

const at = (iso: string) => new Date(iso);
const sec = (iso: string) => Math.floor(at(iso).getTime() / 1000);

describe("isSessionStale", () => {
  it("sem troca de senha registrada, nunca é velha", () => {
    assert.equal(isSessionStale(sec("2026-01-01T00:00:00Z"), null), false);
    assert.equal(isSessionStale(undefined, null), false);
  });

  it("token emitido antes da troca de senha é velho", () => {
    assert.equal(
      isSessionStale(sec("2026-01-01T10:00:00Z"), at("2026-01-02T10:00:00Z")),
      true,
    );
  });

  it("token emitido depois da troca é válido", () => {
    assert.equal(
      isSessionStale(sec("2026-01-03T10:00:00Z"), at("2026-01-02T10:00:00Z")),
      false,
    );
  });

  it("o token da própria troca (mesmo segundo, ms depois) NÃO é invalidado", () => {
    // Troca às 12:00:00,900; o novo token sai às 12:00:01 ou, truncado, 12:00:00.
    const changed = at("2026-01-02T12:00:00.900Z");
    assert.equal(isSessionStale(sec("2026-01-02T12:00:00Z"), changed), false);
    assert.equal(isSessionStale(sec("2026-01-02T12:00:01Z"), changed), false);
  });

  it("token sem iat, havendo troca de senha, é tratado como velho", () => {
    assert.equal(isSessionStale(undefined, at("2026-01-02T10:00:00Z")), true);
  });
});
