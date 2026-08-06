import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { FREE_LIMITS, MEDIA_TAGS, type MediaTag } from "@/lib/media";

export const runtime = "nodejs";

// POST /api/admin/media — envia arquivo (multipart) para o storage + banco.
// Campos: file, tag (normal|medium|hot_medium|hot), type (image|video).
export async function POST(request: Request): Promise<NextResponse> {
  const store = await cookies();
  const username = await getCurrentUser(store.get(SESSION_COOKIE)?.value ?? null);
  if (!username) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formato inválido (use multipart/form-data)." }, { status: 400 });
  }

  const file = form.get("file");
  const rawTag = String(form.get("tag") ?? "").trim();
  const rawType = String(form.get("type") ?? "image").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }

  const validTags = MEDIA_TAGS.map((t) => t.value);
  if (!validTags.includes(rawTag as MediaTag)) {
    return NextResponse.json(
      { error: `tag inválida. Use: ${validTags.join(", ")}` },
      { status: 400 }
    );
  }
  const tag = rawTag as MediaTag;

  const isVideo = rawType === "video";
  if (rawType !== "image" && rawType !== "video") {
    return NextResponse.json({ error: "type inválido (image|video)." }, { status: 400 });
  }

  const maxBytes = isVideo ? FREE_LIMITS.maxVideoBytes : FREE_LIMITS.maxPhotoBytes;
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: `Arquivo muito grande (máx ${Math.round(maxBytes / 1024 / 1024)} MB para ${isVideo ? "vídeo" : "foto"}).`,
      },
      { status: 413 }
    );
  }

  const folder = isVideo ? "videos" : tag; // hot_medium fica em hot_medium/
  const ext = (file.name.split(".").pop() ?? "").toLowerCase() || (isVideo ? "mp4" : "jpg");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${folder}/${Date.now()}_${safeName}`;

  const bytes = Buffer.from(await file.arrayBuffer());

  // upload via service role (escrita admin; RLS/Storage não bloqueiam service role).
  const { error: upErr } = await getSupabaseAdmin().storage
    .from(SUPABASE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: `Falha no upload: ${upErr.message}` }, { status: 500 });
  }

  // URL pública de leitura (anon não exige auth para bucket public).
  const { data: urlData } = getSupabaseAdmin().storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(storagePath);
  const fileUrl = urlData.publicUrl;

  const record = await prisma.media.create({
    data: {
      tag,
      type: isVideo ? "video" : "image",
      storagePath,
      fileUrl,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    },
  });

  return NextResponse.json({ ok: true, media: record });
}

// GET /api/admin/media?tag=&type= — lista as mídias do bucket (banco).
export async function GET(request: Request): Promise<NextResponse> {
  const store = await cookies();
  const username = await getCurrentUser(store.get(SESSION_COOKIE)?.value ?? null);
  if (!username) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag") ?? undefined;
  const type = searchParams.get("type") ?? undefined;

  const media = await prisma.media.findMany({
    where: {
      ...(tag ? { tag: tag as never } : {}),
      ...(type ? { type: type as never } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ media });
}

// DELETE /api/admin/media?id= — apaga do banco e do storage.
export async function DELETE(request: Request): Promise<NextResponse> {
  const store = await cookies();
  const username = await getCurrentUser(store.get(SESSION_COOKIE)?.value ?? null);
  if (!username) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "id inválido." }, { status: 400 });

  const record = await prisma.media.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ error: "Mídia não encontrada." }, { status: 404 });
  }

  // remove do storage primeiro; se falhar, ainda apaga o registro? Não —
  // mantém consistência: só apaga do banco se apagar do storage.
  const { error } = await getSupabaseAdmin().storage
    .from(SUPABASE_BUCKET)
    .remove([record.storagePath]);
  if (error) {
    return NextResponse.json({ error: `Falha no storage: ${error.message}` }, { status: 500 });
  }

  await prisma.media.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export { MEDIA_TAGS, FREE_LIMITS };