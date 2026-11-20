/**
 * Remove de storage/uploads os arquivos sem anexo no banco (sobras de chamados
 * apagados ou de uploads interrompidos).
 *
 *   npm run storage:cleanup            # só lista (simulação)
 *   npm run storage:cleanup -- --apply # apaga de verdade
 *   npm run storage:cleanup -- --apply --grace-minutes=5
 */
import "dotenv/config";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_GRACE_MS, findOrphans } from "../src/lib/orphans";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "storage/uploads");

const apply = process.argv.includes("--apply");
const graceArg = process.argv.find((a) => a.startsWith("--grace-minutes="));
const graceMs = graceArg ? Number(graceArg.split("=")[1]) * 60_000 : DEFAULT_GRACE_MS;

if (!Number.isFinite(graceMs) || graceMs < 0) {
  console.error("--grace-minutes precisa ser um número >= 0.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  let names: string[];
  try {
    names = await readdir(UPLOAD_DIR);
  } catch {
    console.log(`Nada a limpar: ${UPLOAD_DIR} não existe.`);
    return;
  }

  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      mtimeMs: (await stat(path.join(UPLOAD_DIR, name))).mtimeMs,
    })),
  );

  const rows = await prisma.attachment.findMany({ select: { storageKey: true } });
  const known = new Set(rows.map((r) => r.storageKey));

  const orphans = findOrphans(files, known, Date.now(), graceMs);

  console.log(
    `${files.length} arquivo(s) no disco, ${known.size} anexo(s) no banco, ${orphans.length} órfão(s).`,
  );
  if (orphans.length === 0) return;

  if (!apply) {
    console.log("Simulação: nada foi apagado. Use --apply para remover.");
    return;
  }

  let removed = 0;
  for (const name of orphans) {
    try {
      await unlink(path.join(UPLOAD_DIR, name));
      removed++;
    } catch (err) {
      console.error(`Falhou ao apagar ${name}:`, (err as Error).message);
    }
  }
  console.log(`${removed} arquivo(s) apagado(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
