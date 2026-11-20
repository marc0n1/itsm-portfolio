import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { getService } from "@/lib/service-queries";
import { ServiceForm } from "../../service-form";

type Params = Promise<{ id: string }>;

export default function EditServicePage(props: { params: Params }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">Editar serviço</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <Loader params={props.params} />
      </Suspense>
    </div>
  );
}

async function Loader({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireRole("ADMIN");
  const service = await getService(user, id);
  if (!service) notFound();

  return (
    <ServiceForm
      initial={{
        id: service.id,
        name: service.name,
        description: service.description,
        defaultPriority: service.defaultPriority,
        active: service.active,
        fields: service.fields,
      }}
    />
  );
}
