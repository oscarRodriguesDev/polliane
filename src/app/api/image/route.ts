import { NextResponse } from "next/server";
import { generateImage } from "@/lib/image";

export const runtime = "nodejs";

// POST /api/image — gera uma imagem da Pollianne com base em um prompt,
// usando as fotos de public/polli como referência (via OpenRouter).
export async function POST(request: Request): Promise<NextResponse> {
  let body: { prompt?: unknown; aspectRatio?: unknown; quality?: unknown };

  try {
    body = (await request.json()) as {
      prompt?: unknown;
      aspectRatio?: unknown;
      quality?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido. Envie JSON com o campo 'prompt'." },
      { status: 400 }
    );
  }

  const prompt = body.prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return NextResponse.json(
      { error: "Campo 'prompt' é obrigatório e deve ser uma string não vazia." },
      { status: 400 }
    );
  }

  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : undefined;
  const quality = typeof body.quality === "string" ? body.quality : undefined;

  try {
    const url = await generateImage(prompt.trim(), { aspectRatio, quality });
    return NextResponse.json({ url });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}