"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { serviceSchema } from "@/lib/services";
import { formValues, type FormState } from "@/lib/tickets";

export async function saveService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const values = formValues(formData);

  let fields: unknown;
  try {
    fields = JSON.parse(String(formData.get("fields") ?? "[]"));
  } catch {
    return { error: "Não foi possível ler os campos do formulário.", values };
  }

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    defaultPriority: formData.get("defaultPriority"),
    active: formData.get("active") === "on",
    fields,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const id = formData.get("id");

  try {
    if (typeof id === "string" && id) {
      // Só edita serviços da própria organização.
      const existing = await prisma.service.findFirst({
        where: { id, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!existing) notFound();

      await prisma.service.update({ where: { id: existing.id }, data: parsed.data });
    } else {
      await prisma.service.create({
        data: { ...parsed.data, organizationId: user.organizationId },
      });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Já existe um serviço com esse nome.", values };
    }
    throw e;
  }

  revalidatePath("/admin/services");
  revalidatePath("/tickets/new");
  redirect("/admin/services");
}

export async function toggleService(formData: FormData) {
  const user = await requireRole("ADMIN");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const service = await prisma.service.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, active: true },
  });
  if (!service) notFound();

  await prisma.service.update({
    where: { id: service.id },
    data: { active: !service.active },
  });

  revalidatePath("/admin/services");
  revalidatePath("/tickets/new");
}
