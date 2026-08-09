import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ChatMemory } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Relatório de aquisição por origem (canal de divulgação).
//   GET /api/metricas?key=<RETENCAO_KEY>
// Agrega as memórias de todos os chats e mostra, por origem:
//   - total de contatos (starts no bot)
//   - quantos chegaram na etapa 4 (pagamento)
//   - quantos pagaram (assinante)
// Serve pra saber qual Kwai/TikTok/canal do Telegram está rendendo venda e
// matar o canal que não converte (regra do plano: CAC tem que ser ≤ R$ 5).
export async function GET(request: Request): Promise<NextResponse> {
  const key = process.env.RETENCAO_KEY ?? "";
  const url = new URL(request.url);
  if (!key || url.searchParams.get("key") !== key) {
    return NextResponse.json({ ok: false, error: "chave inválida" }, { status: 401 });
  }

  const rows = await prisma.profileMemory.findMany();

  const porOrigem = new Map<
    string,
    { total: number; etapa4: number; pagos: number }
  >();

  for (const row of rows) {
    const mem = (row.data ?? {}) as Partial<ChatMemory>;
    const ev = (mem.evidencias ?? {}) as ChatMemory["evidencias"];
    const origem = (ev.origem || "site").slice(0, 40);

    const agg = porOrigem.get(origem) ?? { total: 0, etapa4: 0, pagos: 0 };
    agg.total++;
    const step = typeof ev.funnel_step === "number" ? ev.funnel_step : Number(ev.funnel_step) || 0;
    if (step >= 4) agg.etapa4++;
    if (ev.assinante) agg.pagos++;
    porOrigem.set(origem, agg);
  }

  const origens = [...porOrigem.entries()]
    .map(([origem, a]) => ({
      origem,
      total: a.total,
      etapa4: a.etapa4,
      pagos: a.pagos,
      // quantos dos que chegaram no pagamento de fato pagaram
      conversaoEtapa4: a.etapa4 > 0 ? Math.round((a.pagos / a.etapa4) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ ok: true, totalChats: rows.length, origens });
}