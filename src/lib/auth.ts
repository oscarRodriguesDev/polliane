import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

// Autenticação do painel admin via cookie de sessão (sem depender do
// Supabase Auth). O login valida o usuário mestre no banco e emite um cookie
// httpOnly com um token STATELESS assinado por HMAC-SHA256.
//
// Por que stateless: em dev, o Next.js compila route handlers e server
// components em bundles separados — um Map em memória não era compartilhado,
// e o layout do dashboard não reconhecia a sessão criada no route handler
// (redirect silencioso de volta ao login). O token assinado é verificado de
// forma independente por qualquer bundle/processo.
//
// NOTA: para produção, troque SESSION_SECRET por um segredo forte via env.

const SESSION_COOKIE = "polli_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

// Segredo para assinar os tokens. Use SESSION_SECRET no .env em produção.
const SECRET =
  process.env.SESSION_SECRET ??
  (process.env.SENHA_BD_SUPABASE ?? "polli-admin-secret-dev").padEnd(32, "x");

function toBase64Url(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}
function fromBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSession(username: string): string {
  const payload = toBase64Url(
    JSON.stringify({ username, exp: Date.now() + SESSION_TTL_MS })
  );
  return `${payload}.${sign(payload)}`;
}

export function destroySession(_token: string | null): void {
  // Stateless: não há store para remover. O cookie é apagado no logout.
}

function readSession(token: string): { username: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(
    Buffer.from(sig, "utf8"),
    Buffer.from(expected, "utf8")
  )) {
    return null;
  }

  try {
    const data = JSON.parse(fromBase64Url(payload)) as {
      username?: string;
      exp?: number;
    };
    if (!data.username || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return { username: data.username };
  } catch {
    return null;
  }
}

export async function getCurrentUser(
  tokenOverride?: string | null
): Promise<string | null> {
  try {
    const store = await cookies();
    const token = tokenOverride ?? store.get(SESSION_COOKIE)?.value ?? null;
    if (!token) return null;
    return readSession(token)?.username ?? null;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE };

// --- Lógica de usuário mestre ---

export async function verifyLogin(
  username: string,
  password: string
): Promise<boolean> {
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) return false;
  return bcrypt.compare(password, admin.passwordHash);
}

export async function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) return { ok: false, error: "Usuário não encontrado" };

  const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!valid) return { ok: false, error: "Senha atual incorreta" };

  if (newPassword.length < 4)
    return { ok: false, error: "A nova senha deve ter ao menos 4 caracteres" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash },
  });
  return { ok: true };
}

export { SESSION_TTL_MS };