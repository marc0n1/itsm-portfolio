"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { formValues, type FormState } from "@/lib/tickets";
import {
  checkUserChange,
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/lib/users";
import { countActiveAdmins, getUserById } from "@/lib/user-queries";

const HASH_ROUNDS = 10;

/** Valores devolvidos ao formulário em caso de erro: nunca a senha. */
function safeValues(formData: FormData) {
  const values = formValues(formData);
  delete values.password;
  return values;
}

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const values = safeValues(formData);

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  // O e-mail é único no sistema todo (é o login), não só na organização.
  const exists = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (exists) return { error: "Já existe um usuário com este e-mail.", values };

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await bcrypt.hash(parsed.data.password, HASH_ROUNDS),
      organizationId: admin.organizationId,
    },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRole("ADMIN");

  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, values: formValues(formData) };
  }
  const { userId, name, role } = parsed.data;
  const active = parsed.data.active === "on";

  const target = await getUserById(admin, userId);
  if (!target) return { error: "Usuário não encontrado." };

  const error = checkUserChange({
    actorId: admin.id,
    target,
    next: { role, active },
    activeAdminCount: await countActiveAdmins(admin.organizationId),
  });
  if (error) return { error, values: formValues(formData) };

  await prisma.user.update({
    where: { id: target.id },
    data: { name, role, active },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${target.id}`);
  return { saved: true };
}

/** Define uma nova senha (não há e-mail de recuperação: o admin repassa). */
export async function resetPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRole("ADMIN");

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const target = await getUserById(admin, parsed.data.userId);
  if (!target) return { error: "Usuário não encontrado." };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.password, HASH_ROUNDS) },
    }),
    // Quem estava bloqueado por tentativas erradas volta a poder entrar.
    prisma.loginAttempt.deleteMany({ where: { email: target.email } }),
  ]);

  return { saved: true };
}
