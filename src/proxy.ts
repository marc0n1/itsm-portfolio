import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, decrypt } from "@/lib/session-edge";

// Checagem OTIMISTA (só lê o cookie). A verificação real, com banco, está em
// src/lib/dal.ts e é chamada dentro das páginas e ações.
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith("/dashboard");

  const session = await decrypt(req.cookies.get(COOKIE_NAME)?.value);

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$|favicon.ico).*)"],
};
