// Script de setup do Supabase Storage.
// Cria (se não existir) o bucket da Pollianne e as subpastas por tag.
// Uso: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/setup-storage.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_kEY ?? "";
const BUCKET = process.env.SUPABASE_BUCKET ?? "polli";

// Subpastas: fotos por tag + vídeos.
const FOLDERS = ["normal", "medium", "hot_medium", "hot", "videos"];

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Faltam SUPABASE_URL / SERVICE_ROLE_KEY no .env");
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1) Garante o bucket (público para leitura; escrita só via service role).
  const { data: buckets, error: listErr } = await sb.storage.listBuckets();
  if (listErr) throw listErr;

  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error: createErr } = await sb.storage.createBucket(BUCKET, {
      public: true, // arquivos acessíveis via URL pública (servidos ao bot/chat)
    });
    if (createErr) throw createErr;
    console.log(`Bucket "${BUCKET}" criado.`);
  } else {
    console.log(`Bucket "${BUCKET}" já existe.`);
  }

  // 2) Garante as subpastas (arquivos placeholder vazios não são obrigatórios,
  //    mas criamos para organização e validação de acesso).
  for (const folder of FOLDERS) {
    const { error: uploadErr } = await sb.storage.from(BUCKET).upload(
      `${folder}/.keep`,
      new Uint8Array(0),
      { upsert: true, contentType: "text/plain" }
    );
    if (uploadErr) throw uploadErr;
    console.log(`Pasta "${folder}/" ok.`);
  }

  console.log("\nSetup do storage concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});