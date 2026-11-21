"use client";

import { useActionState } from "react";
import { rateTicket } from "../rating-actions";
import { SCORES, SCORE_LABEL, stars } from "@/lib/csat";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500";

export function RatingForm({
  ticketId,
  current,
}: {
  ticketId: string;
  current: { score: number; comment: string | null } | null;
}) {
  const [state, action, pending] = useActionState(rateTicket, undefined);
  // Em caso de erro o React limpa o form: repreenche com o que foi enviado.
  const score = state?.values?.score ?? (current ? String(current.score) : "");
  const comment = state?.values?.comment ?? current?.comment ?? "";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />

      {/* key: o React reseta o form após salvar; recriar os campos mantém o valor novo. */}
      <div key={`${score}|${comment}`} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="sr-only">Nota do atendimento</legend>
          <div className="flex flex-wrap gap-2">
            {SCORES.map((n) => (
              <label
                key={n}
                className="flex cursor-pointer flex-col items-center gap-0.5 rounded-md border border-zinc-300 px-3 py-2 text-center text-xs has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300"
              >
                <input
                  type="radio"
                  name="score"
                  value={n}
                  defaultChecked={score === String(n)}
                  required
                  className="sr-only"
                />
                <span aria-hidden className="text-base text-amber-500">
                  {stars(n)}
                </span>
                <span className="font-medium">
                  {n} · {SCORE_LABEL[n]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="csat-comment" className="text-sm text-zinc-600">
            Quer comentar? <span className="text-zinc-500">(opcional)</span>
          </label>
          <textarea
            id="csat-comment"
            name="comment"
            rows={3}
            maxLength={1000}
            defaultValue={comment}
            className={field}
          />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" className="text-sm text-green-700">
          Obrigado pela avaliação!
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Enviando..." : current ? "Atualizar avaliação" : "Enviar avaliação"}
      </button>
    </form>
  );
}
