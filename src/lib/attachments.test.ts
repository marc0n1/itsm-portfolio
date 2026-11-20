import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_FILE_BYTES,
  extensionOf,
  sanitizeFilename,
  validateFile,
} from "./attachments";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const PDF = new TextEncoder().encode("%PDF-1.7 ...");
const TEXT = new TextEncoder().encode("linha de log");

describe("validateFile", () => {
  it("aceita arquivos válidos e define o mime pela extensão", () => {
    assert.deepEqual(validateFile({ name: "print.PNG", size: 10 }, PNG), {
      ok: { name: "print.PNG", mime: "image/png", size: 10 },
    });
    assert.ok("ok" in validateFile({ name: "a.pdf", size: 10 }, PDF));
    assert.ok("ok" in validateFile({ name: "erro.log", size: 10 }, TEXT));
  });

  it("recusa tipos fora da lista (html, svg, exe)", () => {
    for (const name of ["a.html", "a.svg", "a.exe", "semextensao"]) {
      assert.ok("error" in validateFile({ name, size: 10 }, TEXT), name);
    }
  });

  it("recusa conteúdo que não bate com a extensão", () => {
    assert.ok("error" in validateFile({ name: "falso.png", size: 10 }, TEXT));
    assert.ok("error" in validateFile({ name: "falso.pdf", size: 10 }, PNG));
    assert.ok("error" in validateFile({ name: "bin.txt", size: 10 }, PNG.map((b) => b || 1).fill(0, 1, 2)));
  });

  it("recusa arquivo vazio ou acima do limite", () => {
    assert.ok("error" in validateFile({ name: "a.txt", size: 0 }, TEXT));
    assert.ok("error" in validateFile({ name: "a.txt", size: MAX_FILE_BYTES + 1 }, TEXT));
    assert.ok("ok" in validateFile({ name: "a.txt", size: MAX_FILE_BYTES }, TEXT));
  });
});

describe("nomes", () => {
  it("remove caminho e caracteres de controle", () => {
    assert.equal(sanitizeFilename("..\..\etc/passwd.txt"), "passwd.txt");
    assert.equal(sanitizeFilename('a"b\u0000c.txt'), "abc.txt");
    assert.equal(sanitizeFilename("   "), "arquivo");
  });

  it("limita o tamanho preservando a extensão", () => {
    const out = sanitizeFilename("x".repeat(300) + ".pdf");
    assert.equal(out.length, 120);
    assert.equal(extensionOf(out), "pdf");
  });
});
