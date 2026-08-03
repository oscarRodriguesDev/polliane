# Checkpoints

## Sessão 1 — Chat Pollianne
- Estado: FEITO. `npx tsc --noEmit` OK, `npm run build` OK.
- Arquivos: `src/lib/ai.ts`, `src/app/api/chat/route.ts`, `src/app/page.tsx`, `src/components/Chat.tsx`.
- Rotas: `/` estática, `/api/chat` dinâmica.

## Sessão 2 — Validação em runtime + modelo parametrizável
- Estado: FEITO. Chave NVIDIA validada em rede: POST `/api/chat` respondeu `200` e a IA respondeu no papel da Pollianne.
- Mudança: `src/lib/ai.ts` — modelo agora via `NVIDIA_MODEL` (env) com fallback `meta/llama-3.1-8b-instruct`.
- Build: `npm run build` OK.
- Pendências: Chat.tsx segue como UI única (sem versão alternativa de agente de UI); avaliar modelo final definitivo.
