/** Lógica pura da limpeza de anexos órfãos (sem I/O): fácil de testar. */

export type DiskFile = { name: string; mtimeMs: number };

/** Mesmo formato da chave gerada em attachment-storage (UUID). */
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Um upload grava o arquivo ANTES da linha no banco; esse intervalo é protegido. */
export const DEFAULT_GRACE_MS = 60 * 60 * 1000;

/**
 * Arquivos do disco sem linha de Attachment correspondente. Ignora:
 * - nomes que não são uma chave nossa (nunca apaga o que não criamos);
 * - arquivos recentes (podem ser um upload em andamento).
 */
export function findOrphans(
  files: DiskFile[],
  knownKeys: ReadonlySet<string>,
  now: number,
  graceMs = DEFAULT_GRACE_MS,
): string[] {
  return files
    .filter((f) => KEY_RE.test(f.name))
    .filter((f) => !knownKeys.has(f.name))
    .filter((f) => now - f.mtimeMs >= graceMs)
    .map((f) => f.name);
}
