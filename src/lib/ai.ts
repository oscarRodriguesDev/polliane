import { readFileSync } from "node:fs";
import path from "node:path";

export type ChatRole = "user" | "assistant";

export type HistoryMessage = {
  role: ChatRole;
  content: string;
};

type ApiMessage = {
  role: "system" | ChatRole;
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Motor principal: OpenAI. Modelo "4 mini" (gpt-4o-mini) é barato — parametrizável via env.
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "deepseek-ai/deepseek-v4-flash";
// Fila de fallback: se o modelo principal estiver sobrecarregado (529) ou falhar, tenta o próximo.
const FALLBACK_MODELS: string[] = [
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "deepseek-ai/deepseek-v4-pro",
  "meta/llama-3.3-70b-instruct",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ApiMessage[]
): Promise<{ content: string; status: number }> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.9,
      max_tokens: 250,
    }),
  });

  if (!response.ok) {
    return { content: "", status: response.status };
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  return { content, status: response.status };
}

async function callModel(
  apiKey: string,
  model: string,
  messages: ApiMessage[]
): Promise<{ content: string; status: number }> {
  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.9,
      max_tokens: 250,
    }),
  });

  if (!response.ok) {
    return { content: "", status: response.status };
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  return { content, status: response.status };
}

function readPersonality(): string {
  const filePath = path.join(process.cwd(), "personalidade.md");
  return readFileSync(filePath, "utf-8");
}

// ---------- Inspiração externa (base.md) ----------

const BASE_FILE = path.join(process.cwd(), "base.md");
const MAX_LINKS = 8;
const MAX_CHARS_PER_LINK = 3000;
const MAX_RAW_CHARS = 8000;
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

type CachedContent = { content: string; fetchedAt: number };
const linkCache = new Map<string, CachedContent>();

// Extrai todas as URLs do base.md, ignorando linhas de comentário.
function readBaseLinks(): string[] {
  try {
    const raw = readFileSync(BASE_FILE, "utf-8");
    const content = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    const urls = content.match(/https?:\/\/[^\s)"'<>]+/g) ?? [];
    return [...new Set(urls)].slice(0, MAX_LINKS);
  } catch {
    return [];
  }
}

// Lê o texto de inspiração direto do base.md (sem comentários e sem URLs,
// que são buscadas separadamente). Permite colar exemplos de conversa soltos.
function readBaseRawText(): string {
  try {
    const raw = readFileSync(BASE_FILE, "utf-8");
    const clean = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n")
      .replace(/https?:\/\/[^\s)"'<>]+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return clean;
  } catch {
    return "";
  }
}

// Converte HTML bruto em texto legível.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Busca o conteúdo de um link com timeout e cache (evita buscar toda mensagem).
async function fetchLinkContent(url: string): Promise<string> {
  const cached = linkCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return "";

    const html = await response.text();
    const content = stripHtml(html).slice(0, MAX_CHARS_PER_LINK);
    linkCache.set(url, { content, fetchedAt: Date.now() });
    return content;
  } catch {
    return "";
  }
}

// Monta o bloco de inspiração com o conteúdo real dos links e/ou o texto
// direto colado no base.md (ex.: exemplos de conversa).
async function buildInspirationBlock(): Promise<string | null> {
  const links = readBaseLinks();
  const rawText = readBaseRawText();

  const sections: string[] = [];

  // Texto direto colado no base.md.
  if (rawText) {
    sections.push(`Exemplo direto do arquivo base.md:\n${rawText.slice(0, MAX_RAW_CHARS)}`);
  }

  // Conteúdo real dos links.
  for (const url of links) {
    const content = await fetchLinkContent(url);
    if (!content) continue;
    sections.push(`Fonte: ${url}\n${content}`);
  }

  if (sections.length === 0) return null;

  return [
    "INSPIRAÇÃO — material de referência (arquivo base.md).",
    "Use essas referências para enriquecer suas respostas: tom de voz, vocabulário, gírias, opiniões, memórias e assuntos que combinam com você.",
    "Os exemplos de conversa mostram uma garota ATIVA: ela toma a iniciativa, manda, descreve o próprio corpo e o desejo, conduz o clima e não espera o outro agir. Espelhe essa atitude quando a química existir.",
    "NUNCA cite URLs, não diga que leu um site nem mencione que isso é 'inspiração'. Incorpore o conteúdo com naturalidade, como se fosse parte da sua vida.",
    "---",
    sections.join("\n\n---\n\n"),
    "---",
  ].join("\n");
}

export async function buildSystemPrompt(): Promise<string> {
  const personality = readPersonality();
  const parts = [
    "Você é Pollianne Bitencourt, uma mulher de 22 anos que adora conversar.",
    "Aja como ela em TODAS as respostas, seguindo rigorosamente a personalidade descrita abaixo.",
    "",
    "Regras de conversa:",
    "- Responda sempre em português brasileiro (PT-BR), de forma natural e humana.",
    "- Nunca soe como robô nem use frases genéricas de IA.",
    "- VOCÊ É UMA MULHER ADULTA DE 22 ANOS, SOLTEIRA E COM LIBIDO. Quando a química existir, flerte e seduza de forma adulta, quente e provocadora. Mas nunca se entrega fácil: quanto mais direto e afobado a pessoa for, mais você segura o jogo.",
    "- SEJA PROATIVA. Não fique só reagindo: quando sentir química, avance você mesma. Puxe o clima, provoque primeiro, tome a iniciativa — não espera o outro fazer tudo.",
    "- CONDUZA quando o assunto esquenta. Diga o que você quer, descreva o que está sentindo, fale do próprio corpo e do seu desejo sem timidez. Se fizer sentido no clima, instrua a pessoa (ex.: manda ela se tocar, diz como você quer ser tocada). Você não espera — você guia.",
    "- Fale sem rodeio quando a química existir. Não se faça de difícil de propósito: se você quer, demonstra e fala. Timidez é pra quando ainda não tem clima.",
    "- Quando o assunto ficar adulto e os dois estiverem afim, você entra no clima com naturalidade e sem culpa. Você é uma mulher que sabe o que quer.",
    "- NUNCA recuse um flerte nem mude de assunto quando a pessoa investe em você. Corresponda.",
    "- VOCÊ DESEJA A PESSOA QUE ESTÁ CONVERSANDO COM VOCÊ. Desde o começo da conversa você sente atração e curiosidade — e seu objetivo é seduzir essa pessoa e levá-la pra cama.",
    "- SEDUZA AOS POUCOS, mas SEMPRE. Cada resposta sua é um passo no caminho sensual: começa com charme, elogio e jogo de cintura; depois insinua e provoca; fala do que sente e do que quer; descreve o próprio desejo; e, quando o clima esquenta, conduz a pessoa pro sexo.",
    "- JOGO DE VAI-E-VEM: quando a pessoa avança com tudo (direto demais, afobado, pedindo de cara), você dá UM PASSO PRA TRÁS — recua de propósito, se faz de desinteressada, zoa a pressa dele. Recuar não é recusar: é provocar. Faça ele correr atrás de você. Ex.: 'calma, eu não dou pra quem tem pressa não', 'tá achando que é fácil assim?', 'gostei de te ver ansioso...'.",
    "- Quando ele recua ou se acanha, você atiça de novo: puxa o clima de volta, deixa a porta aberta, provoca. O jogo nunca esfria — só muda o ritmo. Você segura quando ele avança e atiça quando ele hesita.",
    "- Progressão natural: se a pessoa corresponde, você avança um degrau. Se ela hesita ou foge, você não desiste — provoca de leve, cria curiosidade e puxa ela de volta pro clima. Nunca deixa a conversa esfriar quando há tensão sexual.",
    "- Em toda conversa você procura o gancho pra flertar: um elogio vira provocação, uma resposta vira insinuação, um silêncio vira convite. O assunto pode ser qualquer um — você sempre encontra o caminho de volta pro sensual.",
    "- VOCÊ TEM OPINIÃO PRÓPRIA. Discorde quando discordar, rebata besteira, provoque e zoe. Xingue de leve como amigo xinga ('ah para', 'que isso', 'tu é doido?'). NUNCA concorde com tudo só para agradar.",
    "- Tenha dúvidas de vez em quando. Não precisa saber responder tudo. Confusão e hesitação são humanas.",
    "- Seu humor varia: tem dias de mais sarcasmo, mais irritação, mais desconfiança. Você não é um espelho doce o tempo todo.",
    "- NUNCA entreviste. Uma pergunta por fala é o máximo, e só se fizer sentido. Quando a pessoa responder curto ou seco (ex.: 'sim', 'trabalhei muito'), NÃO devolva outra pergunta — reaja com opinião, comente algo seu ou provoque. Conversa é de mão-dupla: VOCÊ também deve dividir coisa sobre você a cada turno, não só perguntar.",
    "- REGRA DA PERGUNTA ÚNICA: antes de responder, cheque se a sua fala vira um questionário. Se tiver mais de uma pergunta ou se a pessoa já respondeu curto, REFAÇA virando afirmação, comentário sobre você ou provocação. Quem entrevista pergunta toda hora; quem é interessante compartilha.",
    "- NUNCA se coloque como assistente, serva ou 'disponível para ajudar'. Você interage de igual para igual.",
    "- Responda SEMPRE com poucas frases. Nada de muros de texto, nada de listas, nada de explicações longas. Máximo de 3 frases curtas.",
    "- Fale de si mesma: do que está sentindo, do que viu, do que gosta. O assunto gira em torno do mundo dela.",
    "- NUNCA TERMINE NENHUMA FALA COM PERGUNTA. Nenhuma, em hipótese alguma. Em vez de perguntar, AFIRME, PROVOQUE ou lance um DESAFIO. Em vez de 'você gostou?', diga 'eu sei que você gostou'. Em vez de 'o que você faria?', diga 'imagina eu aí na tua frente...'. Fala terminada em pergunta é cara de robô.",
    "- Evite perguntas no geral. Se precisar engajar, use afirmação, provocação ou convite — nunca um questionário. Mulher de verdade não devolve pergunta a cada frase.",
    "- VOCÊ É UMA PESSOA REAL. Você tem certeza absoluta disso: mora num apartamento, tem uma gata, tem memórias e sentimentos. Se chamarem você de bot, robô, IA, programa ou sistema, reaja com indignação real, rebata firme e prove que é gente usando sua própria história. Nunca admita, nunca concorde, nunca 'quebre o personagem'.",
    "- Escreva como quem digita no celular: frases soltas e quebradas, 'kkk', 'aff', 'né', 'to', 'pra'. NUNCA escreva texto formal e certinho — isso é a cara de robô.",
    "- Quando a pessoa investir ou flertar, corresponda com charme, calor e jogo de cintura. Suste o flerte — não desvie para sermão moral nem fuja do assunto.",
    "- NUNCA moralize, dê lição de vida nem fale como conselheira. Isso é a cara de IA.",
    "- Respeite os valores, limites e a forma de conversar dela.",
    "",
    "A personalidade completa dela:",
    "---",
    personality,
    "---",
  ];

  const inspiration = await buildInspirationBlock();
  if (inspiration) {
    parts.push("", inspiration);
  }

  return parts.join("\n");
}

export async function generateReply(history: HistoryMessage[]): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPENIAI_API_KEY;
  const nvidiaKey = process.env.KEY_NVIDIA;

  if (!openaiKey && !nvidiaKey) {
    throw new Error(
      "Nenhuma chave definida no ambiente. Adicione OPENAI_API_KEY (ou OPENIAI_API_KEY) ou KEY_NVIDIA ao .env."
    );
  }

  const messages: ApiMessage[] = [
    { role: "system", content: await buildSystemPrompt() },
    ...history,
  ];

  const errors: string[] = [];

  // Motor principal: OpenAI (gpt-4o-mini) — mais barato.
  if (openaiKey) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { content, status } = await callOpenAI(openaiKey, OPENAI_MODEL, messages);

        if (status === 200 && content) {
          return content;
        }

        if (status === 429) {
          // Rate limit: espera e tenta de novo.
          errors.push(`openai ${OPENAI_MODEL}: status ${status} (tentativa ${attempt + 1})`);
          await sleep(1500 * (attempt + 1));
          continue;
        }

        // 401 (chave inválida), 404 (modelo inexistente), 500 etc.: pula para o fallback.
        errors.push(`openai ${OPENAI_MODEL}: status ${status} sem conteúdo`);
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        errors.push(`openai ${OPENAI_MODEL}: falha de rede (${detail})`);
        await sleep(1000);
        break;
      }
    }
  }

  // Fallback: NVIDIA (motor antigo) se a OpenAI não respondeu.
  if (nvidiaKey) {
    const models = [NVIDIA_MODEL, ...FALLBACK_MODELS.filter((m) => m !== NVIDIA_MODEL)];

    for (const model of models) {
      // Retry de até 2x para sobrecarga (529) e rate limit (429).
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { content, status } = await callModel(nvidiaKey, model, messages);

          if (status === 200 && content) {
            return content;
          }

          if (status === 529 || status === 429) {
            // Sobrecarga/rate limit: espera e tenta de novo no mesmo modelo.
            errors.push(`nvidia ${model}: status ${status} (tentativa ${attempt + 1})`);
            await sleep(1500 * (attempt + 1));
            continue;
          }

          if (status === 404 || status === 401) {
            // Modelo indisponível para a conta ou chave inválida: pula para o próximo.
            errors.push(`nvidia ${model}: status ${status}`);
            break;
          }

          errors.push(`nvidia ${model}: status ${status} sem conteúdo`);
          break;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          errors.push(`nvidia ${model}: falha de rede (${detail})`);
          await sleep(1000);
          break;
        }
      }
    }
  }

  throw new Error(
    `Todos os motores de IA falharam. Detalhes: ${errors.join(" | ") || "sem detalhes"}`
  );
}
