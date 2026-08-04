import { NextResponse } from "next/server";
import {
  getBotToken,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
  handleTelegramUpdate,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET é usado para gerenciar o webhook via navegador/curl:
//   /api/telegram?set=<url-publica>   → registra o webhook
//   /api/telegram?delete=1            → remove o webhook
//   /api/telegram?info=1              → mostra o estado atual do webhook
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);

  if (!getBotToken()) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN não definido no .env" },
      { status: 500 }
    );
  }

  try {
    if (url.searchParams.has("set")) {
      const hookUrl = url.searchParams.get("set");
      if (!hookUrl) {
        return NextResponse.json({ ok: false, error: "Informe ?set=<url>" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, result: await setWebhook(hookUrl) });
    }

    if (url.searchParams.has("delete")) {
      return NextResponse.json({ ok: true, result: await deleteWebhook() });
    }

    return NextResponse.json({ ok: true, result: await getWebhookInfo() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}

// POST recebe os updates (mensagens) que o Telegram envia para o webhook.
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Payload JSON inválido" }, { status: 400 });
  }

  try {
    // Normaliza o message (campos opcionais) antes de processar.
    const normalized = (body ?? {}) as Record<string, unknown>;
    await handleTelegramUpdate(normalized as never);
    // Sempre responde 200 ao Telegram, mesmo se ignorou.
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Erro no webhook do Telegram:", detail);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}