import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  THROTTLE,
  blockedMessage,
  checkLoginThrottle,
  clientIp,
} from "@/lib/login-throttle";

/**
 * Acesso ao banco do limite de tentativas, compartilhado por tudo que confere
 * uma senha (login e troca de senha): quem erra a senha atual também conta.
 */

export async function currentClientIp() {
  return clientIp(
    (await headers()).get("x-forwarded-for"),
    process.env.TRUST_PROXY === "1",
  );
}

/** Devolve a mensagem de bloqueio, ou null se pode tentar. */
export async function throttleError(email: string, ip: string) {
  const since = new Date(Date.now() - THROTTLE.windowMs);
  const select = { createdAt: true } as const;
  const [accountRows, ipRows] = await Promise.all([
    prisma.loginAttempt.findMany({
      where: { email, ip, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select,
    }),
    ip
      ? prisma.loginAttempt.findMany({
          where: { ip, createdAt: { gte: since } },
          orderBy: { createdAt: "asc" },
          select,
        })
      : Promise.resolve(null),
  ]);

  const result = checkLoginThrottle({
    accountFailures: accountRows.map((r) => r.createdAt.getTime()),
    ipFailures: ipRows ? ipRows.map((r) => r.createdAt.getTime()) : null,
    now: Date.now(),
  });
  return result.blocked ? blockedMessage(result.retryAfterSeconds) : null;
}

export async function recordFailure(email: string, ip: string) {
  await prisma.loginAttempt.create({ data: { email, ip } });
  // Faxina oportunista: registros com mais de um dia não servem mais.
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}

export async function clearFailures(email: string, ip: string) {
  await prisma.loginAttempt.deleteMany({ where: { email, ip } });
}
