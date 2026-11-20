"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createResponse, deleteResponse, updateResponse } from "./actions";
import { PLACEHOLDERS } from "@/lib/responses";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const primary =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60";

function PlaceholderHelp() {
  return (
    <p className="text-xs text-zinc-500">
      Variáveis:{" "}
      {Object.entries(PLACEHOLDERS).map(([key, help], i) => (
        <span key={key}>
          {i > 0 && ", "}
          <code className="rounded bg-zinc-100 px-1">{`{{${key}}}`}</code> ({help})
        </span>
      ))}
      . Elas são preenchidas ao inserir no chamado.
    </p>
  );
}

type Initial = { title: string; body: string };

function Fields({ initial, values }: { initial?: Initial; values?: Record<string, string> }) {
  return (
    <>
      <div className="space-y-1">
        <label htmlFor="title" className="text-sm font-medium">
          Título
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={80}
          placeholder="Ex.: Pedido de mais informações"
          defaultValue={values?.title ?? initial?.title ?? ""}
          className={field}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="body" className="text-sm font-medium">
          Texto
        </label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={5000}
          rows={6}
          defaultValue={values?.body ?? initial?.body ?? ""}
          className={field}
        />
        <PlaceholderHelp />
      </div>
    </>
  );
}

export function CreateResponseForm() {
  const [state, action, pending] = useActionState(createResponse, undefined);

  return (
    // key: após salvar com sucesso o formulário é recriado, limpo (o React
    // restauraria os valores do render anterior).
    <form
      key={state?.saved ? "saved" : "editing"}
      action={action}
      className="space-y-4"
    >
      <Fields values={state?.values} />
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" className="text-sm text-green-700">
          Resposta criada.
        </p>
      )}
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Salvando..." : "Criar resposta"}
      </button>
    </form>
  );
}

export function EditResponseForm({
  response,
}: {
  response: { id: string; title: string; body: string };
}) {
  const [state, action, pending] = useActionState(updateResponse, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="responseId" value={response.id} />
      {/* key nos campos: mantém os valores salvos após o reset do React. */}
      <div key={`${response.title}|${response.body}`} className="space-y-4">
        <Fields initial={response} values={state?.values} />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" className="text-sm text-green-700">
          Alterações salvas.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
        <Link href="/responses" className="text-sm text-zinc-600 hover:underline">
          Voltar
        </Link>
      </div>
    </form>
  );
}

export function DeleteResponseButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteResponse}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir a resposta "${title}"? Isso não pode ser desfeito.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="responseId" value={id} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
      >
        Excluir resposta
      </button>
    </form>
  );
}
