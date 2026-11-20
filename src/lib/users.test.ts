import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  changePasswordSchema,
  checkUserChange,
  createUserSchema,
  passwordSchema,
  updateUserSchema,
} from "./users";

describe("passwordSchema", () => {
  it("exige ao menos 8 caracteres", () => {
    assert.equal(passwordSchema.safeParse("1234567").success, false);
    assert.equal(passwordSchema.safeParse("12345678").success, true);
  });

  it("limita em 72 BYTES (limite real do bcrypt), não em caracteres", () => {
    assert.equal(passwordSchema.safeParse("a".repeat(72)).success, true);
    assert.equal(passwordSchema.safeParse("a".repeat(73)).success, false);
    // "ç" ocupa 2 bytes: 37 caracteres = 74 bytes.
    assert.equal(passwordSchema.safeParse("ç".repeat(37)).success, false);
    assert.equal(passwordSchema.safeParse("ç".repeat(36)).success, true);
  });
});

describe("createUserSchema", () => {
  const ok = { name: "Maria Silva", email: "  Maria@Empresa.COM ", role: "AGENT", password: "senha-forte-1" };

  it("normaliza o e-mail (minúsculo, sem espaços) e apara o nome", () => {
    const r = createUserSchema.safeParse({ ...ok, name: "  Maria Silva  " });
    assert.ok(r.success);
    assert.equal(r.data.email, "maria@empresa.com");
    assert.equal(r.data.name, "Maria Silva");
  });

  it("recusa e-mail inválido, perfil inexistente e nome curto", () => {
    assert.equal(createUserSchema.safeParse({ ...ok, email: "sem-arroba" }).success, false);
    assert.equal(createUserSchema.safeParse({ ...ok, role: "ROOT" }).success, false);
    assert.equal(createUserSchema.safeParse({ ...ok, name: "A" }).success, false);
  });
});

describe("updateUserSchema", () => {
  it("o checkbox ausente significa inativo", () => {
    const r = updateUserSchema.safeParse({ userId: "u1", name: "Ana", role: "AGENT" });
    assert.ok(r.success);
    assert.equal(r.data.active, undefined);
  });
});

describe("checkUserChange", () => {
  const admin = { id: "a1", role: "ADMIN" as const, active: true };
  const agent = { id: "g1", role: "AGENT" as const, active: true };

  it("permite editar outro usuário normalmente", () => {
    assert.equal(
      checkUserChange({ actorId: "a1", target: agent, next: { role: "ADMIN", active: true }, activeAdminCount: 1 }),
      null,
    );
    assert.equal(
      checkUserChange({ actorId: "a1", target: agent, next: { role: "AGENT", active: false }, activeAdminCount: 1 }),
      null,
    );
  });

  it("ninguém altera o próprio perfil nem se desativa", () => {
    assert.match(
      checkUserChange({ actorId: "a1", target: admin, next: { role: "AGENT", active: true }, activeAdminCount: 2 })!,
      /próprio perfil/,
    );
    assert.match(
      checkUserChange({ actorId: "a1", target: admin, next: { role: "ADMIN", active: false }, activeAdminCount: 2 })!,
      /desativar a sua própria/,
    );
  });

  it("editar o próprio nome (sem mudar perfil/situação) é permitido", () => {
    assert.equal(
      checkUserChange({ actorId: "a1", target: admin, next: { role: "ADMIN", active: true }, activeAdminCount: 1 }),
      null,
    );
  });

  it("não deixa a organização sem administrador ativo", () => {
    const other = { id: "a2", role: "ADMIN" as const, active: true };
    // Só existe 1 admin ativo (o alvo): rebaixar ou desativar é recusado.
    assert.match(
      checkUserChange({ actorId: "a1", target: other, next: { role: "AGENT", active: true }, activeAdminCount: 1 })!,
      /ao menos um administrador/,
    );
    assert.match(
      checkUserChange({ actorId: "a1", target: other, next: { role: "ADMIN", active: false }, activeAdminCount: 1 })!,
      /ao menos um administrador/,
    );
    // Com outro admin ativo, tudo bem.
    assert.equal(
      checkUserChange({ actorId: "a1", target: other, next: { role: "AGENT", active: true }, activeAdminCount: 2 }),
      null,
    );
  });

  it("admin já inativo pode ser rebaixado mesmo sendo o único 'admin' contado", () => {
    const inactive = { id: "a3", role: "ADMIN" as const, active: false };
    assert.equal(
      checkUserChange({ actorId: "a1", target: inactive, next: { role: "AGENT", active: false }, activeAdminCount: 1 }),
      null,
    );
  });
});

describe("changePasswordSchema", () => {
  const ok = { current: "senha-atual-1", password: "senha-nova-22", confirm: "senha-nova-22" };

  it("aceita a troca válida", () => {
    assert.equal(changePasswordSchema.safeParse(ok).success, true);
  });

  it("exige a senha atual", () => {
    assert.equal(changePasswordSchema.safeParse({ ...ok, current: "" }).success, false);
  });

  it("recusa confirmação diferente", () => {
    const r = changePasswordSchema.safeParse({ ...ok, confirm: "outra-coisa-33" });
    assert.equal(r.success, false);
    if (!r.success) assert.match(r.error.issues[0].message, /confirmação/);
  });

  it("recusa nova senha igual à atual e fraca/longa demais", () => {
    assert.equal(
      changePasswordSchema.safeParse({ ...ok, password: ok.current, confirm: ok.current }).success,
      false,
    );
    assert.equal(changePasswordSchema.safeParse({ ...ok, password: "curta", confirm: "curta" }).success, false);
    const long = "a".repeat(73);
    assert.equal(changePasswordSchema.safeParse({ ...ok, password: long, confirm: long }).success, false);
  });
});
