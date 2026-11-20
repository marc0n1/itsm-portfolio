import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { PRIORITIES, REQUESTER_PRIORITIES } from "@/lib/tickets";
import { NewTicketForm } from "./new-ticket-form";

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold">Novo chamado</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <FormLoader />
      </Suspense>
    </div>
  );
}

async function FormLoader() {
  const user = await requireUser();
  // Só o atendimento pode abrir chamados já como "Crítica".
  const priorities =
    user.role === "REQUESTER" ? REQUESTER_PRIORITIES : PRIORITIES;
  return <NewTicketForm priorities={priorities} />;
}
