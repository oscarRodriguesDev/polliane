import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/img?u=<url> — baixa a imagem remota e repassa, evitando bloqueio
// de CORS/hotlink do navegador. Assim a foto da Pollianne sempre carrega no chat.
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url).searchParams.get("u");
  if (!url) {
    return NextResponse.json({ error: "Faltou o parâmetro 'u'." }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Origem respondeu ${res.status}` }, { status: 502 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao buscar a imagem." }, { status: 502 });
  }
}