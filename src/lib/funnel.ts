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
        "IMPORTANTE: você ainda NÃO recebeu o pagamento. Se a pessoa disser que pagou ou mandar comprovante, " +
        "responda que está aguardando a confirmação aqui do seu lado e que entrega assim que o sistema confirmar. " +
        "NUNCA diga que já liberou, NUNCA prometa envio imediato e NUNCA use tag de foto nesta etapa. " +
        "Seja natural, agradeça por qualquer ajuda e mostre que você vai entregar conteúdo de verdade."
      );
    default:
      return (
        "A pessoa já te apoiou. Trate-a como assinante de verdade: agradecida, próxima e disposta a mostrar o conteúdo completo. " +
        "Não repita pedido de pagamento nem o roteiro inicial."
      );
  }
}

/**
 * Fala padronizada que acompanha a foto do funil — GERADA SEM IA.
 *
 * Por quê: quando a foto é picante/hot, os modelos de linguagem (moderação
 * anti-pornografia) se recusam ou "desviam" de falar sobre ela, deixando a
 * mensagem genérica. Aqui extraímos detalhes da `description` da foto e
 * montamos uma fala natural da Pollianne a partir de TEMPLATES fixos — sempre
 * cita a peça/pose específica, com vergonha e charme, sem depender do modelo.
 */
/**
 * Extrai a "peça" de roupa ou a "pose" mais provável da descrição, pra ancorar
 * a fala padronizada. Devolve { tipo: "peca" | "pose" | null, texto }.
 */
function extractVisualDetail(description: string): {
  tipo: "peca" | "pose" | null;
  texto: string;
} {
  const d = description.toLowerCase();
  const pecas = [
    "blusinha florida", "blusinha preta", "blusinha branca", "blusinha alcinha",
    "blusinha", "vestidinho florido", "vestidinho", "vestido", "lingerie vermelha",
    "lingerie", "calcinha", "camisola", "sainha jeans", "saia", "trança",
    "óculos de grau", "oculos de grau", "baton rosado",
  ];
  for (const p of pecas) if (d.includes(p)) return { tipo: "peca", texto: p };

  const poses = [
    "na banheira", "no espelho", "deitada de ladinho", "deitada de lado",
    "de costas", "de frente", "em pé", "deitada",
  ];
  for (const p of poses) if (d.includes(p)) return { tipo: "pose", texto: p };

  return { tipo: null, texto: "" };
}

const FUNNEL_PHOTO_LINES: Record<string, string[]> = {
  normal: [
    "olha isso… acha que combina comigo? 💕 (fotografei agora)",
    "tirei essa hoje, o que achou? tô sem vergonha, pode falar. 😌",
  ],
  hot_medium: [
    "me conta, tá gostando do que tá vendo? 🫣 (nem mostro tudo ainda)",
    "essa foi a mais ousadinha que tirei… será que eu mostro mais? 😏",
  ],
  hot: [
    "hmm… será que você aguenta ver o resto? 👀 tô quase te mostrando tudo",
    "é… eu tava com umas ideias na cabeça quando tirei essa. 🫦",
  ],
};

// Prefixo natural da fala conforme o detalhe visual detectado. Peças entram
// com "olha pra minha/essa…"; poses com "olha eu…".
function visualPrefix(detalhe: { tipo: "peca" | "pose" | null; texto: string }): string {
  if (detalhe.tipo === "peca") return `olha pra minha ${detalhe.texto}… `;
  if (detalhe.tipo === "pose") return `olha eu ${detalhe.texto}… `;
  return "";
}

/**
 * Monta a fala que acompanha a foto do funil (etapas 0/2/3) usando a
 * `description` real da foto + um template do nível. Devolve 1-2 frases,
 * SEM chamar IA — a moderação dos modelos travaria fotos picantes.
 */
export function funnelPhotoLine(tag: string, description?: string): string {
  const linhas = FUNNEL_PHOTO_LINES[tag] ?? FUNNEL_PHOTO_LINES.normal;
  const detalhe = extractVisualDetail(description ?? "");
  const linha = linhas[Math.floor(Math.random() * linhas.length)];
  const prefixo = visualPrefix(detalhe);
  return prefixo ? `${prefixo}${linha}` : linha;
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
// A etapa 4 (pagamento) NÃO avança sozinha: ela fica aguardando a confirmação
// do pagamento (webhook/simulador chamam `markAsPaid`, que pula pra 5).
// Sem isso, a IA da etapa 5 trata a pessoa como assinante mesmo sem ter pago.
export async function advanceFunnelStep(
  chatKey: string,
  step: number
): Promise<number> {
  const next = Math.min(step + 1, FUNNEL_PAYMENT_STEP);
  await updateFunnelStep(chatKey, next);
  return next;
}

/** Etapa de pagamento: o funil trava aqui até o pagamento ser confirmado. */
export const FUNNEL_PAYMENT_STEP = 4;

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
  // Regra de negócio: pagamento garante acesso por 1 SEMANA.
  await setMemoryField(
    chatKey,
    "evidencias.conteudo_liberado_ate",
    new Date(Date.now() + ACCESS_DURATION_MS).toISOString()
  );
}

/** Duração do acesso pago: 7 dias. */
export const ACCESS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** A pessoa ainda tem acesso pago (dentro da 1 semana)? */
export async function hasActiveAccess(chatKey: string): Promise<boolean> {
  const mem = await getChatMemory(chatKey);
  const ate = (mem.evidencias as unknown as Record<string, unknown>)
    .conteudo_liberado_ate;
  if (typeof ate !== "string" || !ate) return false;
  return Date.now() < new Date(ate).getTime();
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
  qrCodeBase64?: string;
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
      qrBase64: typeof evid.pix_qr_base64 === "string" ? evid.pix_qr_base64 : undefined,
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
    `💰 Valor: R$ ${Number(process.env.ASAAS_PIX_VALUE ?? "10").toFixed(2)}`,
    `📲 PIX copia e cola (a chave toda da linha abaixo):`,
    "",
    pix.pixCopyPaste,
    "",
    "Ou escaneia o QR code aqui do lado 💚",
    "Assim que o pagamento cair, eu libero TODO o conteúdo na hora pra você. 😘",
  ].join("\n");

  if (pix.paymentId) {
    await setMemoryField(chatKey, "evidencias.pix_payment_id", pix.paymentId);
  }
  await setMemoryField(chatKey, "evidencias.pix_text", texto);
  if (pix.qrCodeBase64) await setMemoryField(chatKey, "evidencias.pix_qr_base64", pix.qrCodeBase64);
  if (pix.filePath) await setMemoryField(chatKey, "evidencias.pix_file_path", pix.filePath);
  if (pix.publicUrl) await setMemoryField(chatKey, "evidencias.pix_public_url", pix.publicUrl);
  await setMemoryField(chatKey, "evidencias.pix_copy", pix.pixCopyPaste);

  return {
    text: texto,
    qrBase64: pix.qrCodeBase64,
    qrCodeBase64: pix.qrCodeBase64,
    filePath: pix.filePath,
    publicUrl: pix.publicUrl,
    paymentId: pix.paymentId,
  };
}