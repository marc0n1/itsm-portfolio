/**
 * A sessão é um JWT sem estado; para trocar a senha derrubar as sessões antigas,
 * comparamos o instante em que o token foi emitido (`iat`, em SEGUNDOS) com o
 * da última troca de senha do usuário.
 *
 * A comparação é em segundos inteiros de propósito: o `iat` é truncado para
 * segundos, então comparar em milissegundos invalidaria por engano o token
 * emitido logo após a troca (ex.: troca às 12:00:00,5 e token com iat 12:00:00).
 * O custo é aceitar um token emitido no MESMO segundo da troca, mas antes dela.
 */
export function isSessionStale(
  issuedAtSeconds: number | undefined,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt) return false;
  // Token sem `iat` não é de um login nosso recente: não dá para confiar.
  if (typeof issuedAtSeconds !== "number") return true;
  return issuedAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}
