import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// Layout do painel admin (raiz). Não exige sessão aqui — a proteção real
// está no layout do route group "(panel)" que envolve o dashboard.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const username = await getCurrentUser(token);

  // Sem sessão: login fica acessível (fora do grupo protegido).
  return <>{children}</>;
}
