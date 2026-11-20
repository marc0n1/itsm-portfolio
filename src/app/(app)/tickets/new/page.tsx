import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getService, listServices } from "@/lib/service-queries";
import { PRIORITIES, REQUESTER_PRIORITIES } from "@/lib/tickets";
import { NewTicketForm } from "./new-ticket-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewTicketPage(props: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold">Novo chamado</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const raw = await searchParams;
  const param = Array.isArray(raw.service) ? raw.service[0] : raw.service;

  // Só o atendimento pode abrir chamados já como "Crítica".
  const priorities =
    user.role === "REQUESTER" ? REQUESTER_PRIORITIES : PRIORITIES;

  const services = await listServices(user, { activeOnly: true });

  // Sem serviço escolhido e com catálogo disponível: mostra o catálogo.
  if (!param && services.length > 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">
          Escolha o tipo de solicitação para ver o formulário certo.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/tickets/new?service=${s.id}`}
              className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-400"
            >
              <p className="font-medium">{s.name}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {s.description || "Sem descrição."}
              </p>
            </Link>
          ))}
          <Link
            href="/tickets/new?service=general"
            className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 hover:border-indigo-400"
          >
            <p className="font-medium">Outro assunto</p>
            <p className="mt-1 text-xs text-zinc-500">
              Não encontrei meu caso na lista.
            </p>
          </Link>
        </div>
      </div>
    );
  }

  // Serviço escolhido: precisa existir, estar ativo e ser da minha organização.
  let service = null;
  if (param && param !== "general") {
    service = await getService(user, param, { activeOnly: true });
    if (!service) notFound();
  }

  return (
    <div className="space-y-4">
      {services.length > 0 && (
        <p className="text-sm text-zinc-500">
          {service ? <>Serviço: <strong>{service.name}</strong></> : "Chamado geral"}
          {" · "}
          <Link href="/tickets/new" className="text-indigo-600 hover:underline">
            Trocar
          </Link>
        </p>
      )}
      <NewTicketForm
        priorities={priorities}
        service={
          service && {
            id: service.id,
            name: service.name,
            description: service.description,
            defaultPriority: service.defaultPriority,
            fields: service.fields,
          }
        }
      />
    </div>
  );
}
