"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveService } from "./actions";
import { FIELD_TYPES, FIELD_TYPE_LABEL, type FieldType } from "@/lib/services";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/tickets";
import type { Priority } from "@/generated/prisma/enums";

type EditableField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  optionsText: string; // uma opção por linha
};

export type ServiceInitial = {
  id: string;
  name: string;
  description: string;
  defaultPriority: Priority;
  active: boolean;
  fields: {
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    options: string[];
  }[];
};

const input =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function ServiceForm({ initial }: { initial?: ServiceInitial }) {
  const [state, action, pending] = useActionState(saveService, undefined);
  // Após um erro, o React limpa os campos de texto: repreenche com o digitado.
  const v = state?.values;
  const [fields, setFields] = useState<EditableField[]>(
    (initial?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      optionsText: f.options.join("\n"),
    })),
  );

  const update = (i: number, patch: Partial<EditableField>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const add = () =>
    setFields((fs) => [
      ...fs,
      {
        key: `f_${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        type: "TEXT",
        required: false,
        optionsText: "",
      },
    ]);

  // O servidor revalida tudo com zod; isto é só o transporte.
  const serialized = JSON.stringify(
    fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options:
        f.type === "SELECT"
          ? f.optionsText
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean)
          : [],
    })),
  );

  return (
    <form action={action} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="fields" value={serialized} />

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">
            Nome do serviço
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={80}
            defaultValue={v?.name ?? initial?.name}
            placeholder="Ex.: Acesso a sistema"
            className={input}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="description" className="text-sm font-medium">
            Descrição
          </label>
          <input
            id="description"
            name="description"
            maxLength={300}
            defaultValue={v?.description ?? initial?.description}
            placeholder="Quando o solicitante deve escolher este serviço"
            className={input}
          />
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <label htmlFor="defaultPriority" className="text-sm font-medium">
              Prioridade padrão
            </label>
            <select
              id="defaultPriority"
              name="defaultPriority"
              defaultValue={v?.defaultPriority ?? initial?.defaultPriority ?? "MEDIUM"}
              className={input}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={v ? v.active === "on" : (initial?.active ?? true)}
            />
            Serviço ativo (aparece no catálogo)
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Campos do formulário</h2>
          <button
            type="button"
            onClick={add}
            disabled={fields.length >= 15}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
          >
            Adicionar campo
          </button>
        </div>

        {fields.length === 0 && (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            Nenhum campo. O solicitante verá apenas título, descrição e
            prioridade.
          </p>
        )}

        {fields.map((f, i) => (
          <div
            key={f.key}
            data-testid="field-row"
            className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
              <input
                aria-label="Nome do campo"
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                maxLength={80}
                placeholder="Nome do campo"
                className={input}
              />
              <select
                aria-label="Tipo do campo"
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as FieldType })}
                className={input}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            {f.type === "SELECT" && (
              <textarea
                aria-label="Opções (uma por linha)"
                value={f.optionsText}
                onChange={(e) => update(i, { optionsText: e.target.value })}
                rows={4}
                placeholder={"Opções (uma por linha)\nEx.:\nERP\nCRM"}
                className={input}
              />
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                Obrigatório
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Mover para cima"
                  className="rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === fields.length - 1}
                  aria-label="Mover para baixo"
                  className="rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setFields((fs) => fs.filter((_, idx) => idx !== i))}
                  className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

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
          {pending ? "Salvando..." : "Salvar serviço"}
        </button>
        <Link
          href="/admin/services"
          className="text-sm text-zinc-600 hover:underline"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
