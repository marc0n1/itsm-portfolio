import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { getResponse } from "@/lib/response-queries";
import { DeleteResponseButton, EditResponseForm } from "../response-forms";

type Params = Promise<{ id: string }>;

export default function EditResponsePage(props: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <EditContent params={props.params} />
    </Suspense>
  );
}

async function EditContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireRole("ADMIN", "AGENT");

  // Escopo da organização: modelo de outra empresa => 404.
  const response = await getResponse(user, id);
  if (!response) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/responses" className="text-sm text-indigo-600 hover:underline">
        ← Voltar para respostas prontas
      </Link>
      <h1 className="text-2xl font-semibold">{response.title}</h1>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <EditResponseForm response={response} />
      </section>

      <section className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="font-medium">Excluir</h2>
          <p className="text-sm text-zinc-500">
            Comentários já enviados com este modelo não são afetados.
          </p>
        </div>
        <DeleteResponseButton id={response.id} title={response.title} />
      </section>
    </div>
  );
}
