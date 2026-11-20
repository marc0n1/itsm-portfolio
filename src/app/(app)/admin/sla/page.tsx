import { Suspense } from "react";
import { requireRole } from "@/lib/dal";
import { getSlaPolicies } from "@/lib/sla-queries";
import { SlaForm } from "./sla-form";

export default function SlaAdminPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Metas de SLA</h1>
        <p className="text-sm text-zinc-500">
          Prazos por prioridade, contados 24 horas por dia. O tempo em
          &quot;Aguardando&quot; pausa o relógio de resolução.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <Loader />
      </Suspense>
    </div>
  );
}

async function Loader() {
  const user = await requireRole("ADMIN");
  const policies = await getSlaPolicies(user.organizationId);
  return <SlaForm initial={policies} />;
}
