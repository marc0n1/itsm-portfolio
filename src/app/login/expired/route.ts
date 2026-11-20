import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/session";

/**
 * Destino de quem tem cookie de sessão válido, mas cujo usuário não vale mais
 * (conta desativada ou removida). O proxy só olha o cookie: sem apagá-lo, ele
 * mandaria o usuário de /login de volta ao painel, que o mandaria ao /login...
 * (loop de redirecionamentos). Aqui o cookie é apagado e só então vai ao login.
 *
 * Cookie só pode ser alterado em Route Handler/Server Action, não em páginas.
 */
export async function GET() {
  await deleteSession();
  redirect("/login");
}
