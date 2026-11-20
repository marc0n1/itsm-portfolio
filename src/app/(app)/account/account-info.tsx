/** E-mail e perfil são somente leitura: quem os altera é o administrador. */
export function AccountInfo({ email, role }: { email: string; role: string }) {
  return (
    <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
      <dt className="text-zinc-500">E-mail</dt>
      <dd>{email}</dd>
      <dt className="text-zinc-500">Perfil</dt>
      <dd>{role}</dd>
    </dl>
  );
}
