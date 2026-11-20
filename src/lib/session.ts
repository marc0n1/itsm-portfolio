import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import {
  COOKIE_NAME,
  SESSION_DAYS,
  decrypt,
  encrypt,
} from "@/lib/session-edge";

export async function createSession(userId: string, role: Role) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await encrypt({ userId, role, expiresAt: expires.getTime() });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function deleteSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSession() {
  const store = await cookies();
  return decrypt(store.get(COOKIE_NAME)?.value);
}
