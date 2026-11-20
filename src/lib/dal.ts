import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";

/**
 * Fonte da verdade da autenticação: valida o cookie E reconfere o usuário no
 * banco (role atual, usuário removido etc.). O proxy.ts faz só checagem otimista.
 */
export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      organizationId: true,
    },
  });
  // Conta desativada: a sessão (que é um token sem estado) deixa de valer na
  // hora, sem precisar esperar expirar.
  return user?.active ? user : null;
});

export type CurrentUser = NonNullable<
  Awaited<ReturnType<typeof getCurrentUser>>
>;

export async function requireUser() {
  const user = await getCurrentUser();
  // Passou pelo proxy (cookie com cara de válido) mas o usuário não vale mais:
  // a rota apaga o cookie antes de ir ao login, evitando loop de redirecionamento.
  if (!user) redirect("/login/expired");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
