import { NextResponse } from "next/server";
import { runRetencao } from "@/lib/retencao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Job de retenção automática:
//   GET /api/retencao?key=<RETENCAO_KEY>
// Chame por um cron gratuito (cron-job.org) ou Vercel Cron a cada 12–24h.
export async function GET(request: Request): Promise<NextResponse> {
  const key = process.env.RETENCAO_KEY ?? "";
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "RETENCAO_KEY não configurada no .env" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("key") !== key) {
    return NextResponse.json({ ok: false, error: "chave inválida" }, { status: 401 });
  }

  try {
    const result = await runRetencao();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}