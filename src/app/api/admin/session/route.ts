import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { FREE_LIMITS } from "@/lib/media";

export const runtime = "nodejs";

// GET /api/admin/session — dados da sessão atual + limites do plano (para o aviso).
export async function GET(): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const username = await getCurrentUser(token);

  if (!username) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    username,
    limits: FREE_LIMITS,
  });
}