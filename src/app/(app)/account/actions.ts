"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { createSession } from "@/lib/session";
import {
  clearFailures,
  currentClientIp,
  recordFailure,
  throttleError,
} from "@/lib/auth-throttle";
import { changePasswordSchema, profileSchema } from "@/lib/users";
import type { FormState } from "@/lib/tickets";

const HASH_ROUNDS = 10;

/** O usuário só altera a PRÓPRIA conta: o id vem da sessão, nunca do formulário. */
export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, values: { name: String(formData.get("name") ?? "") } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
  });

  // O nome aparece no cabeçalho de todas as telas.
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Quem errar a senha atual repetidamente é barrado como no login: senão
  // uma sessão roubada serviria para adivinhar a senha sem limite.
  const ip = await currentClientIp();
  const blocked = await throttleError(user.email, ip);
  if (blocked) return { error: blocked };

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const ok = record
    ? await bcrypt.compare(parsed.data.current, record.passwordHash)
    : false;
  if (!ok) {
    await recordFailure(user.email, ip);
    return { error: "A senha atual está incorreta." };
  }
  await clearFailures(user.email, ip);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, HASH_ROUNDS),
      // Derruba as OUTRAS sessões (outros navegadores/aparelhos)...
      passwordChangedAt: new Date(),
    },
  });
  // ...e reemite a desta aba, para quem trocou continuar logado.
  await createSession(user.id, user.role);

  return { saved: true };
}
