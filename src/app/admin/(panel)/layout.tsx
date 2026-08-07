import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// Layout do painel admin — exige sessão de mestre. Sem sessão, redireciona ao login.
// Colocado em um route group "(panel)" para não proteger a própria página de login.
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const username = await getCurrentUser(token);

  if (!username) {
    redirect("/admin/login");
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <main>{children}</main>
    </div>
  );
}
