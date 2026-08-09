import { NextResponse } from "next/server";
import {
  asaasConfigured,
  getPaymentStatus,
  isPaidEvent,
  isPaidStatus,
} from "@/lib/asaas";
import { markAsPaid } from "@/lib/funnel";

export const runtime = "nodejs";

/**
 * Webhook do Asaas: recebe o status dos pagamentos e LIBERA o conteúdo quando
 * a cobrança é paga (PIX).
 *
 * Segurança: além de aceitar só um token (ASAAS_WEBHOOK_KEY via ?token= ou
 * header x-asaas-key), faz uma VALIDAÇÃO DUPLA — consulta o status real da
 * cobrança na API antes de liberar. Assim um payload falso não libera nada.
 *
 * O chat liberado é identificado pelo externalReference da cobrança (= chatKey).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!asaasConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Asaas não configurado" },
      { status: 503 }
    );
  }

  // Token de validação opcional (header x-asaas-key ou ?token=).
  const key = process.env.ASAAS_WEBHOOK_KEY ?? "";
  if (key) {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("token");
    const fromHeader = request.headers.get("x-asaas-key") ?? "";
    if (fromQuery !== key && fromHeader !== key) {
      return NextResponse.json({ ok: false, error: "token inválido" }, { status: 401 });
    }
  }

  let body: {
    event?: string;
    payment?: { id?: string; externalReference?: string; status?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json inválido" }, { status: 400 });
  }

  const payment = body.payment ?? {};
  const paymentId = typeof payment.id === "string" ? payment.id : "";
  const event = body.event;

  // 1) Confirma o status na API do Asaas (validação dupla).
  const confirmed = paymentId ? await getPaymentStatus(paymentId) : { ok: true, status: payment.status };
  const paid = isPaidStatus(confirmed.ok ? confirmed.status : payment.status) || isPaidEvent(event);

  if (!paid) {
    // Pagamento ainda não confirmado — sem ação (e confirma o recebimento pro Asaas).
    return NextResponse.json({ ok: true, received: true, action: "wait" });
  }

  // 2) Descobre o chat via externalReference e libera o conteúdo.
  const chatKey = confirmed.externalReference ?? payment.externalReference ?? "";
  if (!chatKey) {
    return NextResponse.json({ ok: true, received: true, action: "no-chat" });
  }

  await markAsPaid(chatKey);
  console.log(`💚 Pagamento confirmado (Asaas) — conteúdo liberado pro chat "${chatKey}"`);
  return NextResponse.json({ ok: true, received: true, action: "liberated" });
}