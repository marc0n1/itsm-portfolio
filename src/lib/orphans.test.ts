import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_GRACE_MS, findOrphans } from "./orphans";

const NOW = 10_000_000_000;
const OLD = NOW - DEFAULT_GRACE_MS - 1;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("findOrphans", () => {
  it("devolve só arquivos antigos que o banco não conhece", () => {
    const files = [
      { name: A, mtimeMs: OLD },
      { name: B, mtimeMs: OLD },
      { name: C, mtimeMs: OLD },
    ];
    assert.deepEqual(findOrphans(files, new Set([A, C]), NOW), [B]);
  });

  it("protege arquivos recentes (upload em andamento)", () => {
    const files = [{ name: B, mtimeMs: NOW - 1000 }];
    assert.deepEqual(findOrphans(files, new Set(), NOW), []);
    // Com tolerância zero, passa a valer.
    assert.deepEqual(findOrphans(files, new Set(), NOW, 0), [B]);
  });

  it("nunca toca em nomes que não são chaves nossas", () => {
    const files = [
      { name: ".gitkeep", mtimeMs: OLD },
      { name: "notas.txt", mtimeMs: OLD },
      { name: "../" + B, mtimeMs: OLD },
    ];
    assert.deepEqual(findOrphans(files, new Set(), NOW), []);
  });

  it("sem órfãos, devolve lista vazia", () => {
    assert.deepEqual(findOrphans([{ name: A, mtimeMs: OLD }], new Set([A]), NOW), []);
    assert.deepEqual(findOrphans([], new Set(), NOW), []);
  });
});
