"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { addComment } from "../actions";
import { AttachmentField } from "../attachment-field";
import { appendToDraft, applyTemplate, type PlaceholderKey } from "@/lib/responses";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500";

type CannedResponse = { id: string; title: string; body: string };

export function CommentForm({
  ticketId,
  staff,
  responses = [],
  vars = {},
}: {
  ticketId: string;
  staff: boolean;
  /** Só chega preenchido para a equipe (o servidor não envia ao solicitante). */
  responses?: CannedResponse[];
  vars?: Partial<Record<PlaceholderKey, string>>;
}) {
  const [state, action, pending] = useActionState(addComment, undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // O campo é "não controlado"; escrevemos direto nele e o envio lê o valor.
  function insert(id: string) {
    const response = responses.find((r) => r.id === id);
    const el = textarea.current;
    if (!response || !el) return;
    el.value = appendToDraft(el.value, applyTemplate(response.body, vars));
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
  // O React limpa o form após o envio: em caso de erro, repreenche o texto.
  const body = state?.values?.body;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      {staff && (
        <div className="flex items-center gap-2 text-sm">
          {responses.length > 0 ? (
            <select
              aria-label="Inserir resposta pronta"
              value=""
              onChange={(e) => insert(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">Inserir resposta pronta...</option>
              {responses.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          ) : (
            <Link href="/responses" className="text-indigo-600 hover:underline">
              Criar respostas prontas
            </Link>
          )}
        </div>
      )}
      <textarea
        ref={textarea}
        name="body"
        required
        maxLength={5000}
        rows={3}
        defaultValue={body}
        placeholder="Escreva um comentário..."
        className={field}
      />
      <AttachmentField id={`files-${ticketId}`} />
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-between">
        {staff ? (
          <label className="flex items-center gap-1.5 text-sm text-zinc-700">
            <input type="checkbox" name="internal" />
            Nota interna (invisível ao solicitante)
          </label>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Comentar
        </button>
      </div>
    </form>
  );
}
