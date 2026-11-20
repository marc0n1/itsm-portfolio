import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusTransition, type StatusState } from "./ticket-status";

const T0 = new Date("2026-01-01T10:00:00Z");
const plus = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const idle: StatusState = {
  resolvedAt: null,
  slaPausedAt: null,
  slaPausedSeconds: 0,
};

describe("statusTransition", () => {
  it("entrar em Aguardando pausa o relógio", () => {
    const d = statusTransition(idle, "WAITING", T0);
    assert.equal(d.status, "WAITING");
    assert.deepEqual(d.slaPausedAt, T0);
    assert.equal(d.slaPausedSeconds, undefined); // não altera o acumulado
  });

  it("sair de Aguardando soma o tempo parado e limpa a pausa", () => {
    const waiting = { ...idle, slaPausedAt: T0, slaPausedSeconds: 100 };
    const d = statusTransition(waiting, "IN_PROGRESS", plus(3600));
    assert.equal(d.slaPausedAt, null);
    assert.equal(d.slaPausedSeconds, 100 + 3600);
  });

  it("continuar em Aguardando não reinicia a pausa", () => {
    const waiting = { ...idle, slaPausedAt: T0 };
    const d = statusTransition(waiting, "WAITING", plus(500));
    assert.equal(d.slaPausedAt, undefined);
    assert.equal(d.slaPausedSeconds, undefined);
  });

  it("mudar entre estados sem pausa não mexe no SLA", () => {
    const d = statusTransition(idle, "IN_PROGRESS", T0);
    assert.equal(d.slaPausedAt, undefined);
    assert.equal(d.slaPausedSeconds, undefined);
  });

  it("resolver direto de Aguardando fecha a pausa e define resolvedAt", () => {
    const waiting = { ...idle, slaPausedAt: T0 };
    const d = statusTransition(waiting, "RESOLVED", plus(600));
    assert.equal(d.slaPausedAt, null);
    assert.equal(d.slaPausedSeconds, 600);
    assert.ok(d.resolvedAt instanceof Date);
  });

  it("preserva a primeira data de resolução e limpa ao reabrir", () => {
    const first = plus(10);
    const closed = { ...idle, resolvedAt: first };
    assert.equal(statusTransition(closed, "CLOSED", plus(99)).resolvedAt, first);
    assert.equal(statusTransition(closed, "OPEN", plus(99)).resolvedAt, null);
  });
});
