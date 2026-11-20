import { z } from "zod";
import { Role } from "@/generated/prisma/enums";

const required = { error: "Campo obrigatório." };

/**
 * O bcrypt só usa os 72 primeiros BYTES da senha; o resto seria ignorado em
 * silêncio. Por isso o limite é em bytes (acentos ocupam mais de 1).
 */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN = 8;

export const passwordSchema = z
  .string(required)
  .min(PASSWORD_MIN, `A senha precisa ter ao menos ${PASSWORD_MIN} caracteres.`)
  .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, {
    message: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes (cerca de ${PASSWORD_MAX_BYTES} caracteres sem acento).`,
  });

const nameSchema = z
  .string(required)
  .trim()
  .min(2, "O nome precisa ter ao menos 2 caracteres.")
  .max(80, "O nome pode ter no máximo 80 caracteres.");

const roleSchema = z.enum(Role, { error: "Perfil inválido." });

export const createUserSchema = z.object({
  name: nameSchema,
  email: z
    .string(required)
    .trim()
    .toLowerCase()
    .max(120, "O e-mail pode ter no máximo 120 caracteres.")
    .pipe(z.email("Informe um e-mail válido.")),
  role: roleSchema,
  password: passwordSchema,
});

export const updateUserSchema = z.object({
  userId: z.string(required).min(1),
  name: nameSchema,
  role: roleSchema,
  // Checkbox: presente ("on") = ativo.
  active: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  userId: z.string(required).min(1),
  password: passwordSchema,
});

type Target = { id: string; role: Role; active: boolean };

/**
 * Regras de proteção do administrador, aplicadas no servidor a cada edição.
 * Devolve a mensagem de erro ou null se a mudança é permitida.
 *
 * - ninguém altera o PRÓPRIO perfil nem se desativa (evita se trancar fora);
 * - nunca pode sobrar a organização sem um administrador ativo.
 */
export function checkUserChange(input: {
  actorId: string;
  target: Target;
  next: { role: Role; active: boolean };
  /** Administradores ativos da organização, contando o alvo se for o caso. */
  activeAdminCount: number;
}): string | null {
  const { actorId, target, next, activeAdminCount } = input;

  if (target.id === actorId) {
    if (next.role !== target.role) {
      return "Você não pode alterar o seu próprio perfil.";
    }
    if (target.active && !next.active) {
      return "Você não pode desativar a sua própria conta.";
    }
  }

  const wasActiveAdmin = target.role === "ADMIN" && target.active;
  const staysActiveAdmin = next.role === "ADMIN" && next.active;
  if (wasActiveAdmin && !staysActiveAdmin && activeAdminCount <= 1) {
    return "É preciso manter ao menos um administrador ativo.";
  }

  return null;
}
