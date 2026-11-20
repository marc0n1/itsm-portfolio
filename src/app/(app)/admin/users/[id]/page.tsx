import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { getUserById } from "@/lib/user-queries";
import { EditUserForm, ResetPasswordForm } from "../user-forms";

type Params = Promise<{ id: string }>;

export default function EditUserPage(props: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <EditContent params={props.params} />
    </Suspense>
  );
}

async function EditContent({ params }: { params: Params }) {
  const { id } = await params;
  const me = await requireRole("ADMIN");

  // Escopo da organização: usuário de outra empresa => 404.
  const user = await getUserById(me, id);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/admin/users" className="text-sm text-indigo-600 hover:underline">
        ← Voltar para usuários
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-zinc-500">
          {user.email} · {user._count.requested} chamado(s) aberto(s) ·{" "}
          {user._count.assigned} atribuído(s)
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Dados e acesso</h2>
        <EditUserForm user={user} isSelf={user.id === me.id} />
      </section>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="font-medium">Redefinir senha</h2>
          <p className="text-sm text-zinc-500">
            Defina uma nova senha e repasse à pessoa. Também libera um bloqueio
            por tentativas de login.
          </p>
        </div>
        <ResetPasswordForm userId={user.id} />
      </section>
    </div>
  );
}
