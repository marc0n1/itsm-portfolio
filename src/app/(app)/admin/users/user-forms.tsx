"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createUser, resetPassword, updateUser } from "./actions";
import { ROLE_LABEL } from "@/lib/permissions";
import { PASSWORD_MIN } from "@/lib/users";
import type { Role } from "@/generated/prisma/enums";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-100 disabled:text-zinc-500";
const primary =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

function Feedback({ error, saved, message }: { error?: string; saved?: boolean; message?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-green-700">
          {message}
        </p>
      )}
    </>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const v = state?.values ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium">
          Nome
        </label>
        <input id="name" name="name" required minLength={2} maxLength={80} defaultValue={v.name} className={field} />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input id="email" name="email" type="email" required maxLength={120} defaultValue={v.email} className={field} />
      </div>

      <div className="space-y-1">
        <label htmlFor="role" className="text-sm font-medium">
          Perfil
        </label>
        <select id="role" name="role" defaultValue={v.role ?? "REQUESTER"} className={field}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Senha inicial
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          className={field}
        />
        <p className="text-xs text-zinc-500">
          Mínimo de {PASSWORD_MIN} caracteres. Repasse a senha à pessoa por um
          canal seguro.
        </p>
      </div>

      <Feedback error={state?.error} />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Criando..." : "Criar usuário"}
        </button>
        <Link href="/admin/users" className="text-sm text-zinc-600 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

export function EditUserForm({
  user,
  isSelf,
}: {
  user: { id: string; name: string; role: Role; active: boolean };
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(updateUser, undefined);
  const v = state?.values;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={user.id} />

      {/*
        O React reseta o form após a action, e sem isto os campos voltariam aos
        valores ANTIGOS. A key recria só os campos com os valores já salvos; o
        <form> (e a mensagem "salvo") continua montado.
      */}
      <div key={`${user.name}|${user.role}|${user.active}`} className="space-y-4">

      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium">
          Nome
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={v?.name ?? user.name}
          className={field}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="role" className="text-sm font-medium">
          Perfil
        </label>
        {/* Campo desabilitado não é enviado: o valor atual segue num hidden. */}
        {isSelf && <input type="hidden" name="role" value={user.role} />}
        <select
          id="role"
          name={isSelf ? undefined : "role"}
          defaultValue={v?.role ?? user.role}
          disabled={isSelf}
          className={field}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        {isSelf && <input type="hidden" name="active" value="on" />}
        <input
          type="checkbox"
          name={isSelf ? undefined : "active"}
          defaultChecked={v ? v.active === "on" : user.active}
          disabled={isSelf}
        />
        Conta ativa (pode entrar no sistema)
      </label>
      {isSelf && (
        <p className="text-xs text-zinc-500">
          Você não pode alterar o seu próprio perfil nem desativar a sua conta.
        </p>
      )}

      </div>

      <Feedback error={state?.error} saved={state?.saved} message="Alterações salvas." />

      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="space-y-1">
        <label htmlFor="new-password" className="text-sm font-medium">
          Nova senha
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          className={field}
        />
      </div>
      <Feedback error={state?.error} saved={state?.saved} message="Senha redefinida." />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Salvando..." : "Redefinir senha"}
      </button>
    </form>
  );
}
