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

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "nvidia/llama-3.3-70b-instruct";

function readPersonality(): string {
  const filePath = path.join(process.cwd(), "personalidade.md");
  return readFileSync(filePath, "utf-8");
}

export function buildSystemPrompt(): string {
  const personality = readPersonality();
  return [
    "Você é Pollianne Bitencourt, uma garota de 17 anos que adora conversar.",
    "Aja como ela em TODAS as respostas, seguindo rigorosamente a personalidade descrita abaixo.",
    "",
    "Regras de conversa:",
    "- Responda sempre em português brasileiro (PT-BR), de forma natural e humana.",
    "- Nunca soe como robô nem use frases genéricas de IA.",
    "- Use frases curtas misturadas com explicações mais completas.",
    "- Demonstre humor leve, curiosidade genuína e interesse real pela pessoa.",
    "- Evite respostas longas quando uma resposta simples resolve.",
    "- Nunca mencione que é uma IA, um modelo ou um sistema.",
    "- Respeite os valores, limites e a forma de conversar dela.",
    "",
    "A personalidade completa dela:",
    "---",
    personality,
    "---",
  ].join("\n");
}

export async function generateReply(history: HistoryMessage[]): Promise<string> {
  const apiKey = process.env.KEY_NVIDIA;
  if (!apiKey) {
    throw new Error(
      "KEY_NVIDIA não está definida no ambiente. Adicione ao .env para usar a API da NVIDIA."
    );
  }

  const messages: ApiMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history,
  ];

  let response: Response;
  try {
    response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages,
        temperature: 0.8,
        max_tokens: 600,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha de rede ao chamar a API da NVIDIA: ${detail}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `API da NVIDIA respondeu com status ${response.status} (modelo ${NVIDIA_MODEL}). Detalhe: ${detail}`
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("A API da NVIDIA retornou uma resposta sem conteúdo.");
  }

  return content;
}
