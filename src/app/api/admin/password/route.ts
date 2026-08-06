import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getCurrentUser,
  changePassword,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/admin/password — troca a senha do mestre autenticado.
export async function POST(request: Request): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const username = await getCurrentUser(token);
  if (!username) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let currentPassword: string;
  let newPassword: string;
  try {
    const body = await request.json();
    currentPassword = String(body.currentPassword ?? "");
    newPassword = String(body.newPassword ?? "");
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const result = await changePassword(username, currentPassword, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}