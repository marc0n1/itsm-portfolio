"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createTicket } from "../actions";
import { AttachmentField } from "../attachment-field";
import { PRIORITY_LABEL } from "@/lib/tickets";
import { fieldInputName, type FieldDef } from "@/lib/services";
import type { Priority } from "@/generated/prisma/enums";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export type NewTicketService = {
  id: string;
  name: string;
  description: string;
  defaultPriority: Priority;
  fields: FieldDef[];
};

export function NewTicketForm({
  priorities,
  service,
}: {
  priorities: Priority[];
  service: NewTicketService | null;
}) {
  const [state, action, pending] = useActionState(createTicket, undefined);

  // Após um erro, o React limpa o formulário: repreenche com o que foi digitado.
  const values = state?.values ?? {};

  // A prioridade padrão do serviço só vale se o perfil puder escolhê-la.
  const defaultPriority =
    service && priorities.includes(service.defaultPriority)
      ? service.defaultPriority
      : "MEDIUM";

  return (
    <form action={action} className="space-y-4">
      {service && <input type="hidden" name="serviceId" value={service.id} />}

      <div className="space-y-1">
        <label htmlFor="title" className="text-sm font-medium">
          Título
        </label>
        <input
          id="title"
          name="title"
          defaultValue={values.title}
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
          defaultValue={values.description}
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          placeholder="Conte o que aconteceu, desde quando e o que você já tentou."
          className={field}
        />
      </div>

      {service && service.fields.length > 0 && (
        <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <legend className="px-1 text-sm font-medium text-zinc-600">
            Informações de {service.name}
          </legend>
          {service.fields.map((f) => (
            <DynamicField
              key={f.key}
              def={f}
              initial={values[fieldInputName(f.key)]}
            />
          ))}
        </fieldset>
      )}

      <div className="space-y-1">
        <label htmlFor="priority" className="text-sm font-medium">
          Prioridade
        </label>
        <select
          id="priority"
          name="priority"
          defaultValue={values.priority ?? defaultPriority}
          className={field}
        >
          {priorities.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <AttachmentField />

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

function DynamicField({ def, initial }: { def: FieldDef; initial?: string }) {
  const name = fieldInputName(def.key);

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium">
        {def.label}
        {def.required && <span className="text-red-600"> *</span>}
      </label>

      {def.type === "TEXTAREA" ? (
        <textarea
          id={name}
          name={name}
          defaultValue={initial}
          required={def.required}
          maxLength={2000}
          rows={3}
          className={field}
        />
      ) : def.type === "SELECT" ? (
        <select
          id={name}
          name={name}
          defaultValue={initial ?? ""}
          required={def.required}
          className={field}
        >
          <option value="">Selecione...</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
          step={def.type === "NUMBER" ? "any" : undefined}
          defaultValue={initial}
          required={def.required}
          maxLength={200}
          className={field}
        />
      )}
    </div>
  );
}
