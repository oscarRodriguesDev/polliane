/**
 * Estado emocional da Pollianne.
 *
 * - 4 TEMPERAMENTOS (teoria dos humores): melancólico, colérico, sanguíneo, fleumático.
 *   Um é sorteado por dia e molda o comportamento da personagem.
 * - 6 EMOÇÕES com nível 0-100: alegria, tristeza, ânimo, energia, ousadia, safadeza.
 *   Começam aleatórias, mudam conforme os eventos da conversa (drift) e
 *   randomizam de novo a cada dia — como humano que acorda bem/mal.
 *
 * Hoje vive em memória (módulo singleton). Formato pronto pra persistir em banco
 * depois (um registro por dia: date, temperamento, emoções).
 */

export type Temperament = "melancolico" | "colerico" | "sanguineo" | "flegmatico";

export type EmotionKey = "alegria" | "tristeza" | "animo" | "energia" | "ousadia" | "safadeza";

export type EmotionLevels = Record<EmotionKey, number>;

export type EmotionalState = {
  date: string; // YYYY-MM-DD (dia do estado)
  temperament: Temperament;
  emotions: EmotionLevels;
};

const EMOTION_KEYS: EmotionKey[] = [
  "alegria",
  "tristeza",
  "animo",
  "energia",
  "ousadia",
  "safadeza",
];

// Descrição de como cada temperamento age na conversa.
export const TEMPERAMENT_INFO: Record<Temperament, { label: string; how: string }> = {
  melancolico: {
    label: "Melancólico",
    how: "sente saudade, fica reflexiva e meio triste, fala mais baixo e devagar, lembra do passado, precisa de carinho mas não pede",
  },
  colerico: {
    label: "Colérico",
    how: "acorda irritada, responde seco, briga fácil, xinga mais, tem pavio curto, mas quando a pessoa aguenta o tranco ela acalma",
  },
  sanguineo: {
    label: "Sanguíneo",
    how: "acordou animada, falante, sociável, ri fácil, puxa conversa, contagia com energia, quer sair e fazer coisas",
  },
  flegmatico: {
    label: "Fleumático",
    how: "calma demais, responde sem pressa, quase não se empolga nem se irrita, observa mais do que fala, tranquilona",
  },
};

// Problemas do dia: a IA escolhe um aleatoriamente pra ela estar passando.
export const PROBLEMAS_DO_DIA: string[] = [
  "o dinheiro apertou e ela não sabe se paga o aluguel ou a luz",
  "um cliente da fotografia sumiu sem pagar o ensaio",
  "a mãe ligou reclamando de novo da vida dela",
  "ela não dormiu bem e tá exausta",
  "brigou com a melhor amiga por um motivo bobo",
  "o vizinho do andar de cima fez barulho a noite toda",
  "a Dandara (gata) amanheceu doente e ela tá preocupada",
  "tá com dúvida se continua com fotografia ou arranja um emprego fixo",
  "a ansiedade apertou antes de uma entrega importante",
  "sonhou com o ex e acordou com aquela sensação esquisita",
  "recebeu uma proposta de trabalho que não sabe se aceita",
  "quebrou alguma coisa importante no apartamento e não tem grana pra consertar",
];

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomEmotions(): EmotionLevels {
  const emotions = {} as EmotionLevels;
  for (const key of EMOTION_KEYS) {
    emotions[key] = rand(10, 95);
  }
  return emotions;
}

function randomTemperament(): Temperament {
  const list: Temperament[] = [
    "melancolico",
    "colerico",
    "sanguineo",
    "flegmatico",
  ];
  return list[rand(0, list.length - 1)];
}

// Singleton em memória.
let currentState: EmotionalState | null = null;

// Devolve o estado do dia, randomizando um novo se a data mudou.
export function getEmotionalState(): EmotionalState {
  const today = todayStr();
  if (!currentState || currentState.date !== today) {
    currentState = {
      date: today,
      temperament: randomTemperament(),
      emotions: randomEmotions(),
    };
  }
  return currentState;
}

// Força um novo sorteio agora (usado no reset/manual).
export function rerollEmotionalState(): EmotionalState {
  currentState = {
    date: todayStr(),
    temperament: randomTemperament(),
    emotions: randomEmotions(),
  };
  return currentState;
}

// Aplica uma mudança (drift) nos níveis de emoção após um evento na conversa.
// Ex.: moodChange({ alegria: +10, safadeza: +20 }) — sempre clamp 0-100.
export function applyEmotionChange(change: Partial<EmotionLevels>): EmotionalState {
  const state = getEmotionalState();
  for (const key of EMOTION_KEYS) {
    const delta = change[key];
    if (typeof delta === "number") {
      state.emotions[key] = Math.max(0, Math.min(100, state.emotions[key] + delta));
    }
  }
  return state;
}

// Sorteia um problema do dia (a IA incorpora como coisa que está acontecendo).
export function pickProblem(): string {
  return PROBLEMAS_DO_DIA[rand(0, PROBLEMAS_DO_DIA.length - 1)];
}

// Bloco de texto injetado no system prompt descrevendo o estado atual.
export function buildStateBlock(): string {
  const state = getEmotionalState();
  const t = TEMPERAMENT_INFO[state.temperament];
  const problema = pickProblem();
  return [
    `ESTADO DO DIA (${state.date}) — IMPORTANTE:`,
    `Temperamento: ${t.label}. Comportamento: ${t.how}.`,
    `Níveis de emoção agora (0 a 100): alegria ${state.emotions.alegria}, tristeza ${state.emotions.tristeza}, ânimo ${state.emotions.animo}, energia ${state.emotions.energia}, ousadia ${state.emotions.ousadia}, safadeza ${state.emotions.safadeza}.`,
    `Problema do dia que está te consumindo: ${problema}.`,
    `Use esse temperamento e esses níveis pra moldar TUDO na sua resposta: se alegria é alta você sorri e anima; se tristeza é alta, seu humor baixa; se ânimo é baixo, você fala preguiçosa e curta; se ousadia/safadeza são altos, você flerta mais ousada. O problema do dia aparece nas suas falas.`,
    "NUNCA fale desses números, do temperamento ou do problema como 'mecânica' — pra você, isso é só como você acordou hoje.",
  ].join("\n");
}
