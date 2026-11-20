/** Regras puras de anexos (sem I/O): fáceis de testar e usadas no servidor. */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 3;

type Rule = { mime: string; check: (head: Uint8Array) => boolean };

const startsWith = (head: Uint8Array, bytes: number[]) =>
  bytes.every((b, i) => head[i] === b);

/** Texto puro não pode conter byte NUL (sinal de binário disfarçado). */
const looksLikeText = (head: Uint8Array) => !head.includes(0);

/**
 * Lista de permissão por extensão. O tipo que o navegador informa é
 * ignorado: o que vale é a extensão aceita + a assinatura do conteúdo.
 * HTML/SVG ficam de fora de propósito (poderiam executar script).
 */
const RULES: Record<string, Rule> = {
  png: { mime: "image/png", check: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: "image/jpeg", check: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", check: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  pdf: { mime: "application/pdf", check: (h) => startsWith(h, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  txt: { mime: "text/plain", check: looksLikeText },
  log: { mime: "text/plain", check: looksLikeText },
  csv: { mime: "text/csv", check: looksLikeText },
};

/** Tipos que o navegador pode exibir com segurança dentro da página. */
export const PREVIEWABLE = new Set(["image/png", "image/jpeg"]);

export const ALLOWED_EXTENSIONS = Object.keys(RULES);
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extensionOf(filename: string) {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

/** Nome só para exibição/download: sem caminho, sem controle, tamanho limitado. */
export function sanitizeFilename(name: string) {
  const base = name.split(/[\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  if (clean.length <= 120) return clean || "arquivo";
  const ext = extensionOf(clean);
  return clean.slice(0, 120 - (ext ? ext.length + 1 : 0)) + (ext ? `.${ext}` : "");
}

export type ValidFile = { name: string; mime: string; size: number };

/**
 * Valida UM arquivo. `head` são os primeiros bytes do conteúdo.
 * Devolve a mensagem de erro (em português) ou os dados normalizados.
 */
export function validateFile(
  file: { name: string; size: number },
  head: Uint8Array,
): { error: string } | { ok: ValidFile } {
  const name = sanitizeFilename(file.name);
  if (file.size === 0) return { error: `"${name}" está vazio.` };
  if (file.size > MAX_FILE_BYTES) {
    return { error: `"${name}" passa do limite de ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  }
  const rule = RULES[extensionOf(name)];
  if (!rule) {
    return {
      error: `"${name}": tipo não permitido. Use ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }
  if (!rule.check(head)) {
    return { error: `"${name}": o conteúdo não corresponde ao tipo do arquivo.` };
  }
  return { ok: { name, mime: rule.mime, size: file.size } };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
