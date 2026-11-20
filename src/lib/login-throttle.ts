/**
 * Regra pura do limite de tentativas de login (sem I/O).
 *
 * Só falhas contam. Dois freios independentes, numa janela deslizante:
 * - por conta+IP: poucas tentativas (protege uma senha de força bruta);
 * - por IP: mais folgado (protege contra quem testa muitas contas).
 * Ficar fora de um freio nunca depende do outro.
 */

export const THROTTLE = {
  windowMs: 15 * 60 * 1000,
  maxPerAccount: 5,
  maxPerIp: 20,
} as const;

/**
 * Quanto falta (ms) para sair do bloqueio. `failures` são os instantes das
 * falhas dentro da janela, em ordem crescente. 0 = liberado.
 *
 * Bloqueia quando já há `max` falhas na janela; libera quando a falha que
 * "fecha" o limite envelhece o suficiente para sair da janela.
 */
export function retryAfterMs(
  failures: readonly number[],
  max: number,
  now: number,
  windowMs: number,
): number {
  const recent = failures.filter((t) => now - t < windowMs);
  if (recent.length < max) return 0;
  const pivot = recent[recent.length - max];
  return Math.max(0, pivot + windowMs - now);
}

export type ThrottleResult =
  | { blocked: false }
  | { blocked: true; retryAfterSeconds: number };

export function checkLoginThrottle(input: {
  accountFailures: readonly number[];
  /** `null` = IP desconhecido: o freio por IP não se aplica. */
  ipFailures: readonly number[] | null;
  now: number;
}): ThrottleResult {
  const { windowMs, maxPerAccount, maxPerIp } = THROTTLE;
  const wait = Math.max(
    retryAfterMs(input.accountFailures, maxPerAccount, input.now, windowMs),
    input.ipFailures
      ? retryAfterMs(input.ipFailures, maxPerIp, input.now, windowMs)
      : 0,
  );
  return wait > 0
    ? { blocked: true, retryAfterSeconds: Math.ceil(wait / 1000) }
    : { blocked: false };
}

export function blockedMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Muitas tentativas. Tente novamente em ${minutes} ${
    minutes === 1 ? "minuto" : "minutos"
  }.`;
}

/**
 * IP do cliente. `X-Forwarded-For` só é confiável atrás de um proxy que o
 * define (TRUST_PROXY=1); senão qualquer cliente poderia forjá-lo e escapar
 * do limite. Sem IP confiável devolve "" (vale só o freio por conta).
 */
export function clientIp(
  forwardedFor: string | null,
  trustProxy: boolean,
): string {
  if (!trustProxy || !forwardedFor) return "";
  const first = forwardedFor.split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : "";
}
