import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase do projeto.
//  - anon: usado em qualquer contexto (público) — serve URLs de arquivo do storage.
//  - admin/service role: usado APENAS no servidor, para operações administrativas
//    (criar/garantir bucket, subir/deletar arquivos, ler com RLS).
//
// NUNCA exponha o service role ao navegador. As rotas de admin/mídia são
// protegidas por autenticação de usuário mestre.

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? "";

const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ??
  process.env.SERVICE_ROLE_kEY ?? // nome antigo com typo (fallback)
  "";

export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "polli";

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (anonClient) return anonClient;
  anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  return anonClient;
}

// Client com service role — SOMENTE no servidor. Operações admin (bucket, upload).
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return adminClient;
}

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
}
