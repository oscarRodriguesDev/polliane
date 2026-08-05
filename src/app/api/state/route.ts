import { NextResponse } from "next/server";
import {
  getEmotionalState,
  rerollEmotionalState,
  TEMPERAMENT_INFO,
  type EmotionLevels,
} from "@/lib/state";

export const runtime = "nodejs";

// GET /api/state — devolve o estado emocional atual da Pollianne
// (temperamento do dia + níveis de emoção). Usado pelos indicadores da UI em dev.
export async function GET(): Promise<NextResponse> {
  const state = getEmotionalState();
  return NextResponse.json({
    date: state.date,
    temperament: state.temperament,
    temperamentLabel: TEMPERAMENT_INFO[state.temperament].label,
    temperamentHow: TEMPERAMENT_INFO[state.temperament].how,
    emotions: state.emotions,
    problem: state.problem,
  });
}

// POST /api/state?reroll=true — sorteia um novo estado manualmente (dev).
export async function POST(request: Request): Promise<NextResponse> {
  const reroll = new URL(request.url).searchParams.get("reroll") === "true";
  const state = reroll ? rerollEmotionalState() : getEmotionalState();
  return NextResponse.json({
    date: state.date,
    temperament: state.temperament,
    temperamentLabel: TEMPERAMENT_INFO[state.temperament].label,
    temperamentHow: TEMPERAMENT_INFO[state.temperament].how,
    emotions: state.emotions as EmotionLevels,
    problem: state.problem,
  });
}