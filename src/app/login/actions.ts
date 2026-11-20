"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import {
  clearFailures,
  currentClientIp,
  recordFailure,
  throttleError,
} from "@/lib/auth-throttle";

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

  const ip = await currentClientIp();

  // Limite de tentativas: checado ANTES de verificar a senha, então quem está
  // bloqueado não consegue nem confirmar uma senha certa.
  const blocked = await throttleError(email, ip);
  if (blocked) return { error: blocked };

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // Conta desativada falha igual a senha errada (não revela que a conta existe).
  if (!user || !user.active || !ok) {
    await recordFailure(email, ip);
    return { error: "E-mail ou senha inválidos." };
  }

  // Acertou: zera as falhas desta conta neste IP.
  await clearFailures(email, ip);

  await createSession(user.id, user.role);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
