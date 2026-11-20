"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "./actions";
import { PASSWORD_MIN } from "@/lib/users";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const primary =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60";

function Feedback({ error, saved, message }: { error?: string; saved?: boolean; message: string }) {
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

export function ProfileForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="space-y-3">
      {/* key: após salvar, o React reseta o campo; recriá-lo mantém o valor novo. */}
      <div key={name} className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium">
          Nome
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={state?.values?.name ?? name}
          className={field}
        />
      </div>
      <Feedback error={state?.error} saved={state?.saved} message="Nome atualizado." />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Salvando..." : "Salvar nome"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="current" className="text-sm font-medium">
          Senha atual
        </label>
        <input
          id="current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={field}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Nova senha
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
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirmar nova senha
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          className={field}
        />
      </div>
      <Feedback
        error={state?.error}
        saved={state?.saved}
        message="Senha alterada. As outras sessões abertas foram encerradas."
      />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}
