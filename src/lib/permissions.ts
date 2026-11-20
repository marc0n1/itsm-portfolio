import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  AGENT: "Agente",
  REQUESTER: "Solicitante",
};

/** Agentes e admins atendem chamados; solicitantes só abrem e acompanham. */
export function canWorkTickets(role: Role) {
  return role === "ADMIN" || role === "AGENT";
}

export function canManageUsers(role: Role) {
  return role === "ADMIN";
}
