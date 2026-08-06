import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// Página /admin — se já logado vai pro dashboard, se não pro login.
export default async function AdminPage() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const username = await getCurrentUser(token);
  redirect(username ? "/admin/dashboard" : "/admin/login");
}