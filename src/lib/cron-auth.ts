import { timingSafeEqual } from "node:crypto";

export type CronAuth = "ok" | "disabled" | "denied";

/**
 * Autenticação do agendador: `Authorization: Bearer <CRON_SECRET>` (o formato
 * que o Vercel Cron já envia). Seguro por padrão:
 * - sem CRON_SECRET configurado a rota fica DESLIGADA ("disabled"), nunca aberta;
 * - a comparação é em tempo constante, para não vazar o segredo pelo tempo de resposta.
 */
export function checkCronAuth(
  authorization: string | null,
  secret: string | undefined,
): CronAuth {
  if (!secret) return "disabled";
  if (!authorization) return "denied";

  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) return "denied";

  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  // timingSafeEqual exige o mesmo tamanho; tamanho diferente já é "negado".
  if (given.length !== expected.length) return "denied";
  return timingSafeEqual(given, expected) ? "ok" : "denied";
}
