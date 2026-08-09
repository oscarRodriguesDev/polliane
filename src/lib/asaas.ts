/**
 * Integração com o Asaas (Pix).
 *
 * Fluxo:
 *  1. createPixCharge(chatKey)  -> POST /v3/payments (billingType=PIX) pegando o
 *                                 customer da pessoa (externalReference = chatKey)
 *                                 e depois GET /v3/payments/{id}/pixQrCode.
 *  2. O webhook (src/app/api/asaas/webhook/route.ts) recebe o status do Asaas e,
 *     para SEGURANÇA, confirma o status consultando a API (validação dupla)
 *     antes de liberar o conteúdo.
 *
 * Env:
 *  ASAAS_API_KEY      (obrigatória)
 *  ASAAS_SANDBOX=1    usa api-sandbox.asaas.com (testes) em vez de produção
 *  ASAAS_PIX_VALUE    valor da cobrança (default 49.90)
 *  ASAAS_DESCRIPTION  descrição da cobrança
 *  ASAAS_WEBHOOK_KEY  token opcional que o webhook deve trazer (?token= ou
 *                     header x-asaas-key) pra impedir chamadas falsas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SANDBOX = (process.env.ASAAS_SANDBOX ?? "0") === "1";
export const ASAAS_BASE = SANDBOX
  ? "https://api-sandbox.asaas.com/v3"
  : "https://api.asaas.com/v3";

const API_KEY = process.env.ASAAS_API_KEY ?? "";
export function asaasConfigured(): boolean {
  return API_KEY.length > 0;
}

export const ASAAS_PIX_VALUE = Number(process.env.ASAAS_PIX_VALUE ?? "10");
export const ASAAS_DESCRIPTION =
  process.env.ASAAS_DESCRIPTION ?? "Acesso ao conteúdo completo da Pollianne";

/** Status do Asaas que contam como PAGO (libera o conteúdo). */
const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);

export function isPaidStatus(status: string | null | undefined): boolean {
  return PAID_STATUSES.has((status ?? "").toUpperCase());
}

// Fetcher comum com a chave de API no header (Asaas usa "access_token").
async function asaasFetch(
  route: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${ASAAS_BASE}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      access_token: API_KEY,
    },
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

type AsaasError = { errors?: Array<{ code?: string; description?: string }> };

function errorMessage(data: unknown): string {
  const e = data as AsaasError;
  if (e?.errors?.length) return e.errors.map((x) => x.description ?? x.code).join("; ");
  return "resposta inesperada do Asaas";
}

/** Busca (ou cria) o customer da pessoa no Asaas usando externalReference=chatKey. */
async function findOrCreateCustomer(chatKey: string): Promise<string> {
  // CPF/CNPJ do dono (configurável por env) — o Asaas exige pra cobrança PIX.
  const doc = (process.env.ASAAS_CNPJ ?? process.env.ASAAS_CUSTOMER_CPF ?? "").trim();

  const list = await asaasFetch(`/customers?externalReference=${encodeURIComponent(chatKey)}&limit=1`);
  if (list.ok && Array.isArray((list.data as { data?: unknown[] })?.data)) {
    const arr = (list.data as { data: Array<{ id: string; cpfCnpj?: string }> }).data;
    if (arr.length > 0) {
      const existing = arr[0];
      // Customer antigo sem CPF/CNPJ (criado antes de existir a config):
      // corrige via PATCH pra não quebrar a criação da cobrança.
      if (doc && !existing.cpfCnpj) {
        await asaasFetch(`/customers/${existing.id}`, {
          method: "POST",
          body: JSON.stringify({ cpfCnpj: doc }),
        });
      }
      return existing.id;
    }
  }

  const customerPayload: Record<string, string> = {
    name: `Chat ${chatKey}`,
    externalReference: chatKey,
    notificationDisabled: "true",
  };
  if (doc) {
    customerPayload.cpfCnpj = doc;
  }

  const created = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify(customerPayload),
  });
  if (!created.ok) throw new Error(`Falha ao criar customer: ${errorMessage(created.data)}`);
  return (created.data as { id: string }).id;
}

export type PixCharge = {
  ok: boolean;
  paymentId?: string;
  // Imagem do QR code (PNG base64) pra exibir no web.
  qrCodeBase64?: string;
  // Cópia e cola do Pix (a "chave").
  pixCopyPaste?: string;
  expiresAt?: string;
  // Arquivo PNG salvo em disco pra enviar no Telegram (multipart) e no web.
  filePath?: string;
  publicUrl?: string;
  status?: string;
  error?: string;
};

async function makePngFile(
  paymentId: string,
  qrBase64: string
): Promise<{ filePath?: string; publicUrl?: string }> {
  try {
    const dir = path.join(process.cwd(), "public", "pix");
    mkdirSync(dir, { recursive: true });
    const fileName = `${paymentId}.png`;
    const filePath = path.join(dir, fileName);
    writeFileSync(filePath, Buffer.from(qrBase64, "base64"));
    return { filePath, publicUrl: `/pix/${fileName}` };
  } catch {
    return {};
  }
}

/**
 * Cria uma cobrança PIX pra pessoa e devolve o QR code (imagem + copia-e-cola).
 * Gera sempre uma cobrança NOVA (o QR dinâmico é de uso único).
 */
export async function createPixCharge(chatKey: string): Promise<PixCharge> {
  if (!asaasConfigured()) {
    return { ok: false, error: "ASAAS_API_KEY não configurada" };
  }
  try {
    const customer = await findOrCreateCustomer(chatKey);
    const today = new Date();
    const due = new Date(today.getTime() + 7 * 86400000); // vence em 7 dias

    const payment = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer,
        billingType: "PIX",
        value: ASAAS_PIX_VALUE,
        dueDate: due.toISOString().slice(0, 10),
        description: ASAAS_DESCRIPTION,
        externalReference: chatKey,
      }),
    });
    if (!payment.ok) throw new Error(`Falha ao criar cobrança: ${errorMessage(payment.data)}`);

    const payData = payment.data as { id: string; status?: string };
    const paymentId = payData.id;

    const qr = await asaasFetch(`/payments/${paymentId}/pixQrCode`);
    if (!qr.ok) throw new Error(`Falha ao gerar QR: ${errorMessage(qr.data)}`);

    const qrData = qr.data as {
      encodedImage?: string;
      payload?: string;
      expirationDate?: string;
      success?: boolean;
    };

    const files = await makePngFile(paymentId, qrData.encodedImage ?? "");

    return {
      ok: true,
      paymentId,
      qrCodeBase64: qrData.encodedImage,
      pixCopyPaste: qrData.payload,
      expiresAt: qrData.expirationDate,
      filePath: files.filePath,
      publicUrl: files.publicUrl,
      status: payData.status,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Consulta o status atual de uma cobrança (usado pelo webhook = validação dupla). */
export async function getPaymentStatus(paymentId: string): Promise<{
  ok: boolean;
  status?: string;
  externalReference?: string;
}> {
  if (!paymentId) return { ok: false };
  const res = await asaasFetch(`/payments/${paymentId}`);
  if (!res.ok) return { ok: false };
  const d = res.data as { status?: string; externalReference?: string };
  return { ok: true, status: d.status, externalReference: d.externalReference };
}

/** Nome do evento do webhook ("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"). */
export function isPaidEvent(event: string | null | undefined): boolean {
  return /PAYMENT_(CONFIRMED|RECEIVED)/i.test(event ?? "");
}