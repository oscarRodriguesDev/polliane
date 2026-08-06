import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLogin, createSession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/admin/login — autentica o usuário mestre e seta cookie de sessão.
export async function POST(request: Request): Promise<NextResponse> {
  let username: string;
  let password: string;
  try {
    const body = await request.json();
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Usuário e senha são obrigatórios." }, { status: 400 });
  }

  const ok = await verifyLogin(username.trim(), password);
  if (!ok) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  const token = createSession(username.trim());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true, username: username.trim() });
}

// GET /api/admin/login — checa se já está autenticado.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: false });
}