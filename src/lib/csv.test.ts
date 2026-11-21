import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("valores simples passam sem aspas; vazios viram vazio", () => {
    assert.equal(csvCell("texto"), "texto");
    assert.equal(csvCell(""), "");
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(42), "42");
    assert.equal(csvCell(0), "0");
  });

  it("aspas, ponto e vírgula e quebras de linha exigem aspas (e dobram as internas)", () => {
    assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
    assert.equal(csvCell("a;b"), '"a;b"');
    assert.equal(csvCell("linha1\nlinha2"), '"linha1\nlinha2"');
    assert.equal(csvCell("linha1\r\nlinha2"), '"linha1\r\nlinha2"');
  });

  it("vírgula NÃO exige aspas (o separador é ponto e vírgula)", () => {
    assert.equal(csvCell("a, b"), "a, b");
  });

  it("neutraliza injeção de fórmula em texto", () => {
    assert.equal(csvCell("=1+1"), "'=1+1");
    assert.equal(csvCell("+55 11 99999"), "'+55 11 99999");
    assert.equal(csvCell("-2 erros"), "'-2 erros");
    assert.equal(csvCell("@usuario"), "'@usuario");
    assert.equal(csvCell("\t=cmd"), "'\t=cmd");
    assert.equal(csvCell('=HYPERLINK("http://x";"y")'), `"'=HYPERLINK(""http://x"";""y"")"`);
  });

  it("não mexe em texto que só CONTÉM esses caracteres no meio", () => {
    assert.equal(csvCell("a=b"), "a=b");
    assert.equal(csvCell("e-mail"), "e-mail");
  });

  it("números nunca são neutralizados (um -1 legítimo continua número)", () => {
    assert.equal(csvCell(-1), "-1");
  });

  it("números inválidos viram vazio", () => {
    assert.equal(csvCell(NaN), "");
    assert.equal(csvCell(Infinity), "");
  });
});

describe("toCsv", () => {
  it("monta cabeçalho e linhas com ';' e CRLF, terminando em quebra de linha", () => {
    assert.equal(
      toCsv(["A", "B"], [["x", 1], ["y;z", null]]),
      'A;B\r\nx;1\r\n"y;z";\r\n',
    );
  });

  it("sem linhas, só o cabeçalho", () => {
    assert.equal(toCsv(["A"], []), "A\r\n");
  });
});
