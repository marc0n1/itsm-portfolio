import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAGE_SIZE, pageWindow, paginate, parsePage, ticketsHref } from "./pagination";

describe("parsePage", () => {
  it("aceita inteiros positivos", () => {
    assert.equal(parsePage("1"), 1);
    assert.equal(parsePage("7"), 7);
  });

  it("qualquer coisa inválida vira 1", () => {
    for (const bad of [undefined, null, "", "0", "-3", "abc", "2.5", "1e3", " 2", "2 ", "0x10"]) {
      assert.equal(parsePage(bad), 1, String(bad));
    }
  });

  it("limita números absurdos", () => {
    assert.equal(parsePage("999999"), 100_000);
    assert.equal(parsePage("9999999999"), 1); // mais de 6 dígitos é rejeitado
  });
});

describe("paginate", () => {
  it("calcula páginas, skip e o intervalo exibido", () => {
    const p = paginate({ page: 2, total: 45 });
    assert.deepEqual(p, {
      page: 2, pageSize: PAGE_SIZE, total: 45, totalPages: 3, skip: 20, from: 21, to: 40,
    });
  });

  it("a última página pode ser parcial", () => {
    const p = paginate({ page: 3, total: 45 });
    assert.equal(p.from, 41);
    assert.equal(p.to, 45);
  });

  it("total exato em múltiplo do tamanho não cria página vazia", () => {
    assert.equal(paginate({ page: 1, total: 40 }).totalPages, 2);
    assert.equal(paginate({ page: 1, total: 20 }).totalPages, 1);
  });

  it("página além do fim cai na última; abaixo de 1 cai na primeira", () => {
    assert.equal(paginate({ page: 99, total: 45 }).page, 3);
    assert.equal(paginate({ page: 0, total: 45 }).page, 1);
  });

  it("sem itens: 1 página, intervalo zerado", () => {
    const p = paginate({ page: 5, total: 0 });
    assert.deepEqual([p.page, p.totalPages, p.skip, p.from, p.to], [1, 1, 0, 0, 0]);
  });

  it("respeita um pageSize customizado", () => {
    assert.equal(paginate({ page: 1, total: 101, pageSize: 50 }).totalPages, 3);
  });
});

describe("pageWindow", () => {
  it("poucas páginas: mostra todas", () => {
    assert.deepEqual(pageWindow(1, 1), [1]);
    assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
    assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
  });

  it("muitas páginas: reticências nas pontas", () => {
    assert.deepEqual(pageWindow(1, 20), [1, 2, "gap", 20]);
    assert.deepEqual(pageWindow(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
    assert.deepEqual(pageWindow(20, 20), [1, "gap", 19, 20]);
  });

  it("não troca um único número omitido por reticências", () => {
    // 1 _ 3 4 5: o "2" cabe, então aparece em vez de "…".
    assert.deepEqual(pageWindow(4, 10), [1, 2, 3, 4, 5, "gap", 10]);
  });
});

describe("ticketsHref", () => {
  it("preserva os filtros e omite page=1", () => {
    assert.equal(ticketsHref({}, 1), "/tickets");
    assert.equal(ticketsHref({ status: "OPEN" }, 1), "/tickets?status=OPEN");
    assert.equal(
      ticketsHref({ q: "vpn", status: "OPEN", priority: "HIGH", mine: "1" }, 3),
      "/tickets?q=vpn&status=OPEN&priority=HIGH&mine=1&page=3",
    );
  });

  it("escapa o texto da busca", () => {
    assert.equal(ticketsHref({ q: "a&b=c d" }, 2), "/tickets?q=a%26b%3Dc+d&page=2");
  });
});
