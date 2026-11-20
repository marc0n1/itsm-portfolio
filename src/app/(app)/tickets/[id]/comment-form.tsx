"use client";

import { useActionState } from "react";
import { addComment } from "../actions";
import { AttachmentField } from "../attachment-field";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500";

export function CommentForm({
  ticketId,
  staff,
}: {
  ticketId: string;
  staff: boolean;
}) {
  const [state, action, pending] = useActionState(addComment, undefined);
  // O React limpa o form após o envio: em caso de erro, repreenche o texto.
  const body = state?.values?.body;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <textarea
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
