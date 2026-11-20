"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createTicket } from "../actions";
import { PRIORITY_LABEL } from "@/lib/tickets";
import type { Priority } from "@/generated/prisma/enums";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function NewTicketForm({ priorities }: { priorities: Priority[] }) {
  const [state, action, pending] = useActionState(createTicket, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="title" className="text-sm font-medium">
          Título
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={120}
          placeholder="Ex.: Não consigo acessar o e-mail"
          className={field}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="description" className="text-sm font-medium">
          Descrição
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder="Conte o que aconteceu, desde quando e o que você já tentou."
          className={field}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="priority" className="text-sm font-medium">
          Prioridade
        </label>
        <select
          id="priority"
          name="priority"
          defaultValue="MEDIUM"
          className={field}
        >
          {priorities.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Abrir chamado"}
        </button>
        <Link href="/tickets" className="text-sm text-zinc-600 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
