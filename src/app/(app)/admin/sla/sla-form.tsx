"use client";

import { useActionState } from "react";
import { saveSla } from "./actions";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/tickets";
import type { Priority } from "@/generated/prisma/enums";

type Policy = { responseMinutes: number; resolutionMinutes: number };

const input =
  "w-28 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Minutos -> horas para exibir (ex.: 15 -> "0.25"). Sem zeros à direita.
const toHours = (minutes: number) => String(Number((minutes / 60).toFixed(2)));

export function SlaForm({ initial }: { initial: Record<Priority, Policy> }) {
  const [state, action, pending] = useActionState(saveSla, undefined);
  const v = state?.values;

  return (
    <form action={action} className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Prioridade</th>
              <th className="px-4 py-2.5">Primeira resposta (horas)</th>
              <th className="px-4 py-2.5">Resolução (horas)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {PRIORITIES.map((p) => (
              <tr key={p}>
                <td className="px-4 py-3 font-medium">{PRIORITY_LABEL[p]}</td>
                <td className="px-4 py-3">
                  <input
                    aria-label={`Primeira resposta, prioridade ${PRIORITY_LABEL[p]}`}
                    name={`response_${p}`}
                    inputMode="decimal"
                    required
                    defaultValue={v?.[`response_${p}`] ?? toHours(initial[p].responseMinutes)}
                    className={input}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    aria-label={`Resolução, prioridade ${PRIORITY_LABEL[p]}`}
                    name={`resolution_${p}`}
                    inputMode="decimal"
                    required
                    defaultValue={v?.[`resolution_${p}`] ?? toHours(initial[p].resolutionMinutes)}
                    className={input}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" className="text-sm text-green-700">
          Metas salvas. Todos os chamados já foram recalculados.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar metas"}
      </button>
    </form>
  );
}
