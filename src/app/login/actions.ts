"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import {
  THROTTLE,
  blockedMessage,
  checkLoginThrottle,
  clientIp,
} from "@/lib/login-throttle";

export type LoginState = { error?: string } | undefined;

// Hash fictício para gastar o mesmo tempo quando o e-mail não existe
// (evita descobrir e-mails cadastrados pelo tempo de resposta).
const DUMMY_HASH = bcrypt.hashSync("senha-fictícia", 10);

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const ip = clientIp(
    (await headers()).get("x-forwarded-for"),
    process.env.TRUST_PROXY === "1",
  );

  // Limite de tentativas: checado ANTES de verificar a senha, então quem está
  // bloqueado não consegue nem confirmar uma senha certa.
  const since = new Date(Date.now() - THROTTLE.windowMs);
  const [accountRows, ipRows] = await Promise.all([
    prisma.loginAttempt.findMany({
      where: { email, ip, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    ip
      ? prisma.loginAttempt.findMany({
          where: { ip, createdAt: { gte: since } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  const throttle = checkLoginThrottle({
    accountFailures: accountRows.map((r) => r.createdAt.getTime()),
    ipFailures: ipRows ? ipRows.map((r) => r.createdAt.getTime()) : null,
    now: Date.now(),
  });
  if (throttle.blocked) {
    return { error: blockedMessage(throttle.retryAfterSeconds) };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    await prisma.loginAttempt.create({ data: { email, ip } });
    // Faxina oportunista: registros fora da janela não servem mais.
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    return { error: "E-mail ou senha inválidos." };
  }

  // Acertou: zera as falhas desta conta neste IP.
  await prisma.loginAttempt.deleteMany({ where: { email, ip } });

  await createSession(user.id, user.role);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
