import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendToDraft,
  applyTemplate,
  firstName,
  responseSchema,
  unknownPlaceholders,
} from "./responses";

describe("applyTemplate", () => {
  const vars = { solicitante: "Sara", numero: "42", agente: "Carlos Agente" };

  it("substitui todas as variáveis, inclusive repetidas e com espaços", () => {
    assert.equal(
      applyTemplate("Olá {{solicitante}}! Chamado #{{ numero }}. — {{agente}}. Até, {{solicitante}}.", vars),
      "Olá Sara! Chamado #42. — Carlos Agente. Até, Sara.",
    );
  });

  it("variável sem valor ou desconhecida permanece visível", () => {
    assert.equal(applyTemplate("Oi {{solicitante}}", {}), "Oi {{solicitante}}");
    assert.equal(applyTemplate("Oi {{nome}}", vars), "Oi {{nome}}");
  });

  it("não interpreta o valor inserido como novo modelo", () => {
    assert.equal(
      applyTemplate("{{solicitante}}", { solicitante: "{{agente}}" }),
      "{{agente}}",
    );
  });

  it("texto sem variáveis passa intacto", () => {
    assert.equal(applyTemplate("Sem variáveis { aqui }.", vars), "Sem variáveis { aqui }.");
  });
});

describe("unknownPlaceholders", () => {
  it("lista só as que não existem, sem repetir", () => {
    assert.deepEqual(
      unknownPlaceholders("{{solicitante}} {{nome}} {{nome}} {{ cpf }} {{numero}}"),
      ["nome", "cpf"],
    );
    assert.deepEqual(unknownPlaceholders("nada aqui"), []);
  });
});

describe("appendToDraft", () => {
  it("rascunho vazio: só o texto", () => {
    assert.equal(appendToDraft("", "Olá"), "Olá");
    assert.equal(appendToDraft("  \n ", "Olá"), "Olá");
  });

  it("com rascunho: separa por linha em branco, sem acumular espaços", () => {
    assert.equal(appendToDraft("Primeiro", "Segundo"), "Primeiro\n\nSegundo");
    assert.equal(appendToDraft("Primeiro  \n\n", "Segundo"), "Primeiro\n\nSegundo");
  });
});

describe("firstName", () => {
  it("devolve o primeiro nome", () => {
    assert.equal(firstName("Sara Solicitante"), "Sara");
    assert.equal(firstName("  Ana  "), "Ana");
    assert.equal(firstName(""), "");
  });
});

describe("responseSchema", () => {
  const ok = { title: "Saudação", body: "Olá {{solicitante}}, tudo bem?" };

  it("aceita um modelo válido e apara os espaços", () => {
    const r = responseSchema.safeParse({ title: "  Saudação ", body: "  Olá  " });
    assert.ok(r.success);
    assert.equal(r.data.title, "Saudação");
    assert.equal(r.data.body, "Olá");
  });

  it("recusa título curto, texto vazio e texto acima de 5000", () => {
    assert.equal(responseSchema.safeParse({ ...ok, title: "A" }).success, false);
    assert.equal(responseSchema.safeParse({ ...ok, body: "   " }).success, false);
    assert.equal(responseSchema.safeParse({ ...ok, body: "a".repeat(5001) }).success, false);
  });

  it("recusa variável desconhecida (erro de digitação)", () => {
    const r = responseSchema.safeParse({ ...ok, body: "Olá {{solicitnte}}" });
    assert.equal(r.success, false);
    if (!r.success) assert.match(r.error.issues[0].message, /Variável desconhecida/);
  });
});
