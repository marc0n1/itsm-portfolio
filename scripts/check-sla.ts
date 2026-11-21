/**
 * Roda os alertas de SLA uma vez, direto no banco (sem precisar do servidor
 * web). Útil para testar e para agendadores que executam comandos:
 *
 *   npm run sla:check
 *
 * Exemplo de cron do sistema, a cada 5 minutos:
 *   *\/5 * * * *  cd /caminho/do/app && npm run sla:check
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runSlaAlertCheck } from "../src/lib/sla-alert-job";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

runSlaAlertCheck(prisma)
  .then((r) => {
    console.log(
      `SLA: ${r.checked} chamado(s) em aberto examinado(s), ${r.alerts} alerta(s) novo(s), ${r.notifications} notificação(ões).`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
