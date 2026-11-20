"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { formValues, type FormState } from "@/lib/tickets";
import { responseSchema, updateResponseSchema } from "@/lib/responses";
import { getResponse } from "@/lib/response-queries";

const STAFF = ["ADMIN", "AGENT"] as const;
const DUPLICATE = "Já existe uma resposta pronta com este título.";

/** Violação da unicidade (organização + título): outra aba/pessoa criou antes. */
function isUniqueViolation(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export async function createResponse(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole(...STAFF);
  const values = formValues(formData);

  const parsed = responseSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  try {
    await prisma.cannedResponse.create({
      data: { ...parsed.data, organizationId: user.organizationId },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: DUPLICATE, values };
    throw err;
  }

  revalidatePath("/responses");
  // Sem `values`: o formulário volta limpo para o próximo modelo.
  return { saved: true };
}

export async function updateResponse(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole(...STAFF);
  const values = formValues(formData);

  const parsed = updateResponseSchema.safeParse({
    responseId: formData.get("responseId"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  // Escopo da organização: modelo de outra empresa não é encontrado.
  const existing = await getResponse(user, parsed.data.responseId);
  if (!existing) return { error: "Resposta não encontrada.", values };

  try {
    await prisma.cannedResponse.update({
      where: { id: existing.id },
      data: { title: parsed.data.title, body: parsed.data.body },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: DUPLICATE, values };
    throw err;
  }

  revalidatePath("/responses");
  revalidatePath(`/responses/${existing.id}`);
  return { saved: true };
}

export async function deleteResponse(formData: FormData) {
  const user = await requireRole(...STAFF);
  const id = String(formData.get("responseId") ?? "");

  const existing = id ? await getResponse(user, id) : null;
  if (existing) {
    await prisma.cannedResponse.delete({ where: { id: existing.id } });
  }

  revalidatePath("/responses");
  redirect("/responses");
}
