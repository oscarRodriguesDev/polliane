/**
 * FUNIL DE VENDAS (modo simplificado) da Pollianne.
 *
 * Quando FUNNEL_MODE=1, o bot perde a complexidade de memória/relacionamento e
 * vira um vendedor de conteúdo com um roteiro FIXO de etapas:
 *
 *   Etapa 0 (apresentacao) : se apresenta, conta que vende conteúdo pra pagar
 *                           a faculdade e manda 1 foto LEVE (não explícita).
 *   Etapa 1 (ajuda)        : conversa explicando que é só uma ajuda (sem foto).
 *   Etapa 2 (media)        : manda a foto de nível MÉDIO (amostra).
 *   Etapa 3 (hot)          : manda a foto HOT (amostra).
 *   Etapa 4 (pagamento)    : entrega os dados de pagamento + o que ganha.
 *   Etapa 5 (fim)          : trata quem já apoiou como assinante (sem repetir).
 *
 * Regras do modo:
 *  - A IA SÓ dá naturalidade de conversa. O SISTEMA decide as fotos e o texto
 *    de pagamento — roteiro garantido, sem depender do capricho do modelo.
 *  - Nenhum aprendizado/recados/relacionamento nesse modo.
 *  - O único estado é o número da etapa (evidencias.funnel_step), por chat.
 */
import { getChatMemory, setMemoryField } from "@/lib/memory";

const FUNNEL_ENABLED = (process.env.FUNNEL_MODE ?? "0") === "1";

export function funnelEnabled(): boolean {
  return FUNNEL_ENABLED;
}

export const FUNNEL_FINAL_STEP = 5;

// Rótulos (diagnóstico/log).
export const STEP_LABELS: Record<number, string> = {
  0: "apresentacao",
  1: "ajuda",
  2: "media",
  3: "hot",
  4: "pagamento",
  5: "fim",
};

// Qual foto o SISTEMA força em cada etapa (null = nenhuma).
// Atenção: o banco Supabase usa tags (normal | medium | hot_medium | hot).
// Hoje o banco só tem normal/hot_medium/hot, então o "nível médio" do funil
// é mapeado pra hot_medium (mais ousada que a leve, sem ser a top explícita).
export function funnelPhotoForStep(step: number): "normal" | "medium" | "hot_medium" | "hot" | null {
  switch (step) {
    case 0:
      return "normal"; // amostra leve, não explícita
    case 2:
      return "hot_medium"; // nível médio (no banco atual)
    case 3:
      return "hot"; // nível hot
    default:
      return null;
  }
}

// Instrução de roteiro que vai pro system prompt, conforme a etapa.
export function funnelStageInstruction(step: number, userName?: string): string {
  const quem = userName?.trim() ? userName.trim() : "a pessoa";
  switch (step) {
    case 0:
      return (
        "Você acabou de conhecer a pessoa (" + quem + ") e vai se apresentar de forma natural e charmosa. " +
        "Conte que você é fotógrafa e vende conteúdo exclusivo seu pra pagar a faculdade — sem pesar a mão, com um tom leve de quem tá pedindo uma ajuda. " +
        "Nesta mensagem você TAMBÉM vai mandar UMA foto sua simples e não-explicita (nível leve) como primeiro cartão de visita. " +
        "Trate a pessoa com calor e curiosidade pra ela querer continuar conversando."
      );
    case 1:
      return (
        "Agora você está explicando de forma carinhosa que é só uma ajuda: a pessoa não precisa comprar nada na força, mas se curtir as suas fotos, " +
        "qualquer contribuição ajuda você a pagar a faculdade. Responda ao que a pessoa disser com naturalidade, sem virar atendente e sem pressionar. " +
        "Mantenha o flerte leve e deixe ela curiosa pro que vem depois."
      );
    case 2:
      return (
        "Chegou a hora de mostrar (amostra): mande UMA foto de nível MÉDIO com um texto provocante mas de bom gosto, " +
        "dando a entender que existe MUITO mais pra quem apoiar. Se a pessoa gostou da anterior, essa é o 'gostinho'. " +
        "Mantenha a vergonha charmoso e o convite no ar."
      );
    case 3:
      return (
        "Última amostra: mande UMA foto de nível HOT com um texto quente, mostrando que o conteúdo completo é ainda melhor. " +
        "Esse é o auge do convencimento — a pessoa já viu leve, média e agora hot. Feche deixando claro que isso é só uma prévia."
      );
    case 4:
      return (
        "Momento de fechar: anuncie com naturalidade e carinho que vai mandar os dados de pagamento pra pessoa " +
        "liberar o conteúdo completo (o sistema anexa o PIX na hora — você não precisa escrever os dados, apenas puxe o clima). " +
        "Liste o que a pessoa ganha ao apoiar: acesso ao conteúdo completo, fotos e vídeos exclusivos e atenção especial. " +
        "Seja natural, agradeça por qualquer ajuda e mostre que você vai entregar conteúdo de verdade."
      );
    default:
      return (
        "A pessoa já te apoiou. Trate-a como assinante de verdade: agradecida, próxima e disposta a mostrar o conteúdo completo. " +
        "Não repita pedido de pagamento nem o roteiro inicial."
      );
  }
}

// Texto dos dados de pagamento. Configurável por env (PAYMENT_INFO) ou padrão.
export function paymentInfo(): string {
  return (
    process.env.PAYMENT_INFO ??
    "Pix (chave): pollianne@apoiase.vip\n" +
      "Titular: Pollianne Bitencourt\n" +
      "Valor sugerido: R$ 49,90/mês (qualquer valor ajuda 🥰)"
  );
}

// Lê a etapa atual do funil (evidencias.funnel_step, default 0).
export async function getFunnelStep(chatKey: string): Promise<number> {
  const mem = await getChatMemory(chatKey);
  const raw = (mem.evidencias as unknown as Record<string, unknown>).funnel_step;
  const step = typeof raw === "number" ? raw : Number(raw) || 0;
  return step < 0 ? 0 : step;
}

// Avança a etapa e persiste (só o mínimo — sem guardar perfil da pessoa).
export async function advanceFunnelStep(
  chatKey: string,
  step: number
): Promise<number> {
  const next = Math.min(step + 1, FUNNEL_FINAL_STEP);
  await updateFunnelStep(chatKey, next);
  return next;
}

export async function updateFunnelStep(
  chatKey: string,
  step: number
): Promise<void> {
  await setMemoryField(chatKey, "evidencias.funnel_step", step);
}

/** Marca a pessoa como assinante PAGO (liberada) e pula pro estágio final. */
export async function markAsPaid(chatKey: string): Promise<void> {
  await setMemoryField(chatKey, "evidencias.assinante", true);
  await setMemoryField(chatKey, "evidencias.funnel_step", FUNNEL_FINAL_STEP);
}

/** A pessoa já pagou / está liberada? */
export async function isPaidSubscriber(chatKey: string): Promise<boolean> {
  const mem = await getChatMemory(chatKey);
  return Boolean(
    (mem.evidencias as unknown as Record<string, unknown>).assinante
  );
}

/** Último paymentId gerado pra essa pessoa (pro webhook casar o pedido). */
export async function getLastPaymentId(chatKey: string): Promise<string | null> {
  const mem = await getChatMemory(chatKey);
  const raw = (mem.evidencias as unknown as Record<string, unknown>).pix_payment_id;
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * Etapa 4 — gera (uma vez) a cobrança PIX no Asaas pra pessoa e devolve o que
 * o sistema deve enviar: o texto com a "chave" copia-e-cola + a imagem do QR.
 * Se o Asaas não estiver configurado, cai no texto estático (PAYMENT_INFO).
 */
export async function buildPaymentPayload(chatKey: string): Promise<{
  text: string;
  qrBase64?: string;
  filePath?: string;
  publicUrl?: string;
  paymentId?: string;
}> {
  const { createPixCharge, asaasConfigured } = await import("@/lib/asaas");

  if (!asaasConfigured()) {
    return { text: paymentInfo() };
  }

  // Já gerou pra essa pessoa? Reusa a MESMA cobrança (sem multiplicar) e
  // reexibe o QR/payload já salvo na memória.
  const existing = await getLastPaymentId(chatKey);
  if (existing) {
    const mem = await getChatMemory(chatKey);
    const evid = mem.evidencias as unknown as Record<string, unknown>;
    const savedText =
      typeof evid.pix_text === "string" && evid.pix_text ? evid.pix_text : paymentInfo();
    return {
      text: savedText,
      filePath: typeof evid.pix_file_path === "string" ? evid.pix_file_path : undefined,
      publicUrl: typeof evid.pix_public_url === "string" ? evid.pix_public_url : undefined,
      paymentId: existing,
    };
  }

  const pix = await createPixCharge(chatKey);
  if (!pix.ok || !pix.pixCopyPaste) {
    console.warn("Asaas falhou, caindo pro texto estático:", pix.error);
    return { text: paymentInfo() };
  }

  const texto = [
    "Pra me apoiar é rapidinho, amor:",
    "",
    `💰 Valor: R$ ${Number(process.env.ASAAS_PIX_VALUE ?? "49.90").toFixed(2)}`,
    `📲 PIX copia e cola (chave):`,
    "```",
    pix.pixCopyPaste,
    "```",
    "",
    "Ou escaneia o QR code aqui do lado 💚",
    "Assim que o pagamento cair, eu libero TODO o conteúdo na hora pra você. 😘",
  ].join("\n");

  if (pix.paymentId) {
    await setMemoryField(chatKey, "evidencias.pix_payment_id", pix.paymentId);
  }
  await setMemoryField(chatKey, "evidencias.pix_text", texto);
  if (pix.filePath) await setMemoryField(chatKey, "evidencias.pix_file_path", pix.filePath);
  if (pix.publicUrl) await setMemoryField(chatKey, "evidencias.pix_public_url", pix.publicUrl);
  await setMemoryField(chatKey, "evidencias.pix_copy", pix.pixCopyPaste);

  return {
    text: texto,
    qrBase64: pix.qrCodeBase64,
    filePath: pix.filePath,
    publicUrl: pix.publicUrl,
    paymentId: pix.paymentId,
  };
}