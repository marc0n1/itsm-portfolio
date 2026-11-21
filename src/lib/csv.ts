/**
 * CSV puro (sem I/O), pensado para abrir direto no Excel em português:
 * separador ";" (o "," é separador decimal na região pt-BR) e quebra de linha
 * CRLF. O BOM UTF-8 (para os acentos) é acrescentado na resposta HTTP.
 */

export const CSV_DELIMITER = ";";
export const CSV_BOM = "﻿";

/**
 * Injeção de fórmula: ao abrir o CSV, o Excel/Sheets executa células que
 * começam com = + - @ (ou tab/CR, que o Excel também ignora antes da fórmula).
 * Como o título do chamado é texto de usuário, essas células ganham um
 * apóstrofo à frente, que as torna texto puro (orientação da OWASP).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export type CsvValue = string | number | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  // Números são nossos (minutos, contagens): nunca passam pela neutralização,
  // senão um "-1" legítimo viraria texto.
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  const text = FORMULA_START.test(value) ? `'${value}` : value;
  const needsQuotes = /[";\r\n]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const line = (cells: CsvValue[]) => cells.map(csvCell).join(CSV_DELIMITER);
  return [line(headers), ...rows.map(line)].join("\r\n") + "\r\n";
}
