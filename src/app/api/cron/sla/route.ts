import { prisma } from "@/lib/prisma";
import { checkCronAuth } from "@/lib/cron-auth";
import { runSlaAlertCheck } from "@/lib/sla-alert-job";

/**
 * Disparo dos alertas de SLA por um agendador externo (cron do sistema, Vercel
 * Cron, GitHub Actions...), por exemplo a cada 5 minutos:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://seu-app/api/cron/sla
 *
 * É seguro repetir: cada prazo só é avisado uma vez (tabela SlaAlert).
 * Sem CRON_SECRET configurado a rota fica desligada (503), nunca aberta.
 * Aceita GET e POST (o Vercel Cron usa GET).
 */
async function handle(req: Request) {
  const auth = checkCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);

  if (auth === "disabled") {
    return Response.json(
      { error: "Agendador desativado: defina CRON_SECRET no ambiente." },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return Response.json(
      { error: "Não autorizado." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  const result = await runSlaAlertCheck(prisma);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
