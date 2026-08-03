# Checkpoints

## Sessão 1 — Chat Pollianne
- Estado: FEITO. `npx tsc --noEmit` OK, `npm run build` OK.
- Arquivos: `src/lib/ai.ts`, `src/app/api/chat/route.ts`, `src/app/page.tsx`, `src/components/Chat.tsx`.
- Rotas: `/` estática, `/api/chat` dinâmica.
- Pendências: validar chave NVIDIA em runtime (não testado com rede); Chat.tsx é fallback.
