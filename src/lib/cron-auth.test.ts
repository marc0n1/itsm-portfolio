import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkCronAuth } from "./cron-auth";

describe("checkCronAuth", () => {
  const secret = "segredo-do-agendador-123";

  it("com o segredo certo: ok", () => {
    assert.equal(checkCronAuth(`Bearer ${secret}`, secret), "ok");
  });

  it("sem CRON_SECRET configurado: a rota fica desligada, mesmo com cabeçalho", () => {
    assert.equal(checkCronAuth(`Bearer ${secret}`, undefined), "disabled");
    assert.equal(checkCronAuth(null, undefined), "disabled");
    assert.equal(checkCronAuth("Bearer ", ""), "disabled");
  });

  it("sem cabeçalho ou em formato errado: negado", () => {
    assert.equal(checkCronAuth(null, secret), "denied");
    assert.equal(checkCronAuth("", secret), "denied");
    assert.equal(checkCronAuth(secret, secret), "denied"); // sem "Bearer"
    assert.equal(checkCronAuth(`Basic ${secret}`, secret), "denied");
    assert.equal(checkCronAuth("Bearer", secret), "denied");
  });

  it("segredo errado, de qualquer tamanho: negado", () => {
    assert.equal(checkCronAuth("Bearer errado", secret), "denied");
    assert.equal(checkCronAuth(`Bearer ${secret}x`, secret), "denied");
    assert.equal(checkCronAuth(`Bearer ${secret.slice(0, -1)}`, secret), "denied");
    assert.equal(checkCronAuth(`Bearer ${secret.toUpperCase()}`, secret), "denied");
  });
});
