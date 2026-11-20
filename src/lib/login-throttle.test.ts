import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  THROTTLE,
  blockedMessage,
  checkLoginThrottle,
  clientIp,
  retryAfterMs,
} from "./login-throttle";

const W = THROTTLE.windowMs;
const NOW = 1_000_000_000;
/** n falhas, uma por minuto, terminando `ago` ms atrás. */
const fails = (n: number, ago = 0) =>
  Array.from({ length: n }, (_, i) => NOW - ago - (n - 1 - i) * 60_000);

describe("retryAfterMs", () => {
  it("abaixo do limite: liberado", () => {
    assert.equal(retryAfterMs(fails(4), 5, NOW, W), 0);
    assert.equal(retryAfterMs([], 5, NOW, W), 0);
  });

  it("no limite: bloqueado até a falha mais antiga que o fecha sair da janela", () => {
    const f = fails(5); // mais antiga: 4 min atrás
    assert.equal(retryAfterMs(f, 5, NOW, W), W - 4 * 60_000);
  });

  it("com mais falhas que o limite, espera até voltar a ficar abaixo dele", () => {
    const f = fails(7); // 7 falhas; precisa sair 3 para ficar com 4
    // a que decide é a 3ª mais antiga (índice 7-5=2), 4 min... 6-2=4 min atrás
    assert.equal(retryAfterMs(f, 5, NOW, W), f[2] + W - NOW);
  });

  it("falhas fora da janela não contam", () => {
    const old = fails(5, W + 1);
    assert.equal(retryAfterMs(old, 5, NOW, W), 0);
  });

  it("o bloqueio expira de fato com o passar do tempo", () => {
    const f = fails(5);
    const wait = retryAfterMs(f, 5, NOW, W);
    assert.equal(retryAfterMs(f, 5, NOW + wait, W), 0);
    assert.ok(retryAfterMs(f, 5, NOW + wait - 1, W) > 0);
  });
});

describe("checkLoginThrottle", () => {
  it("libera quem está abaixo dos dois limites", () => {
    assert.deepEqual(
      checkLoginThrottle({ accountFailures: fails(4), ipFailures: fails(19), now: NOW }),
      { blocked: false },
    );
  });

  it("5 falhas na conta bloqueiam, devolvendo os segundos restantes", () => {
    const r = checkLoginThrottle({ accountFailures: fails(5), ipFailures: [], now: NOW });
    assert.equal(r.blocked, true);
    if (r.blocked) assert.equal(r.retryAfterSeconds, Math.ceil((W - 4 * 60_000) / 1000));
  });

  it("20 falhas no IP bloqueiam mesmo com a conta limpa", () => {
    const r = checkLoginThrottle({
      accountFailures: [],
      ipFailures: Array.from({ length: 20 }, (_, i) => NOW - i * 1000),
      now: NOW,
    });
    assert.equal(r.blocked, true);
  });

  it("IP desconhecido (null): só vale o freio por conta", () => {
    assert.deepEqual(
      checkLoginThrottle({ accountFailures: [], ipFailures: null, now: NOW }),
      { blocked: false },
    );
    assert.equal(
      checkLoginThrottle({ accountFailures: fails(5), ipFailures: null, now: NOW }).blocked,
      true,
    );
  });

  it("vale o maior dos dois tempos de espera", () => {
    const account = fails(5, 10 * 60_000); // quase expirando
    const ip = Array.from({ length: 20 }, () => NOW); // acabou de estourar
    const r = checkLoginThrottle({ accountFailures: account, ipFailures: ip, now: NOW });
    assert.equal(r.blocked && r.retryAfterSeconds, Math.ceil(W / 1000));
  });
});

describe("blockedMessage", () => {
  it("arredonda para cima e concorda no plural", () => {
    assert.match(blockedMessage(1), /1 minuto\./);
    assert.match(blockedMessage(61), /2 minutos\./);
    assert.match(blockedMessage(900), /15 minutos\./);
  });
});

describe("clientIp", () => {
  it("ignora X-Forwarded-For quando não confia no proxy", () => {
    assert.equal(clientIp("1.2.3.4", false), "");
  });

  it("com proxy confiável, usa o primeiro IP da lista", () => {
    assert.equal(clientIp("203.0.113.9, 10.0.0.1", true), "203.0.113.9");
    assert.equal(clientIp("2001:db8::1", true), "2001:db8::1");
  });

  it("rejeita lixo e ausência", () => {
    assert.equal(clientIp(null, true), "");
    assert.equal(clientIp("<script>", true), "");
    assert.equal(clientIp("a".repeat(100), true), "");
  });
});
