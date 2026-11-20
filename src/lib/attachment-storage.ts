import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateFile, MAX_FILES } from "@/lib/attachments";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "storage/uploads");

/** A chave é sempre um UUID gerado aqui; nunca vem do usuário. */
function pathFor(key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("storageKey inválida");
  return path.join(UPLOAD_DIR, key);
}

export type StoredFile = {
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
};

/** Arquivos reais enviados no campo (ignora o "vazio" que o navegador manda). */
export function filesFrom(formData: FormData, field = "files"): File[] {
  return formData
    .getAll(field)
    .filter((v): v is File => typeof v !== "string" && v.size > 0 && v.name !== "");
}

/**
 * Valida TODOS os arquivos e só então grava em disco. Se algo falhar, nada
 * fica salvo. Devolve a lista para criar as linhas do banco.
 */
export async function storeFiles(
  files: File[],
): Promise<{ error: string } | { stored: StoredFile[] }> {
  if (files.length > MAX_FILES) {
    return { error: `Envie no máximo ${MAX_FILES} arquivos por vez.` };
  }

  const prepared: { buffer: Buffer; name: string; mime: string; size: number }[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    // O tamanho confiável é o do conteúdo recebido, não o declarado.
    const result = validateFile({ name: file.name, size: buffer.length }, buffer.subarray(0, 8192));
    if ("error" in result) return { error: result.error };
    prepared.push({ buffer, ...result.ok });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const stored: StoredFile[] = [];
  try {
    for (const p of prepared) {
      const storageKey = randomUUID();
      await writeFile(pathFor(storageKey), p.buffer, { flag: "wx" });
      stored.push({ filename: p.name, mimeType: p.mime, size: p.size, storageKey });
    }
  } catch (err) {
    await removeFiles(stored);
    throw err;
  }
  return { stored };
}

export async function removeFiles(stored: { storageKey: string }[]) {
  await Promise.all(stored.map((s) => unlink(pathFor(s.storageKey)).catch(() => {})));
}

export async function readStored(key: string) {
  return readFile(pathFor(key));
}

