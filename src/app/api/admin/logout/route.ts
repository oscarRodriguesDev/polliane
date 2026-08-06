import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, getCurrentUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/admin/logout — encerra a sessão do painel.
export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  if (token) {
    // apenas derruba se o token pertencia a uma sessão válida
    await getCurrentUser(token);
    destroySession(token);
    store.delete(SESSION_COOKIE);
  }
  return NextResponse.json({ ok: true });
}