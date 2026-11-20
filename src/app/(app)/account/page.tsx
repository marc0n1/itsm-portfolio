import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/permissions";
import { AccountInfo } from "./account-info";
import { PasswordForm, ProfileForm } from "./account-forms";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Minha conta</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <AccountContent />
      </Suspense>
    </div>
  );
}

async function AccountContent() {
  const user = await requireUser();

  return (
    <>
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Seus dados</h2>
        <AccountInfo email={user.email} role={ROLE_LABEL[user.role]} />
        <ProfileForm name={user.name} />
      </section>

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="font-medium">Alterar senha</h2>
          <p className="text-sm text-zinc-500">
            Ao trocar a senha, as outras sessões abertas (outros navegadores ou
            aparelhos) são encerradas.
          </p>
        </div>
        <PasswordForm />
      </section>
    </>
  );
}
