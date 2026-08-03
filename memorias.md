# Memórias (VIBECODE)

## Sessão 1 — Chat Pollianne (API + IA)
- Criado `src/lib/ai.ts`: lê `personalidade.md`, monta system prompt PT-BR, `generateReply` chama NVIDIA `nvidia/llama-3.3-70b-instruct` (temp 0.8, max_tokens 600).
- Criado `src/app/api/chat/route.ts`: `runtime="nodejs"`, GET e POST /api/chat com conversa fixa id=1.
- Atualizado `src/app/page.tsx`: renderiza `<Chat />`.
- Criado `src/components/Chat.tsx` (fallback): UI consome GET/POST /api/chat. Substituir pela versão do agente de UI se existir.
- `src/lib/db.ts` e `src/types/node-sqlite.d.ts` criados por outro agente. Confere com contrato.
- Decisão: `getOrCreateConversation()` sem id cria conversa nova a cada chamada (db.ts). Para persistência única, route usa `getOrCreateConversation(1)`.
- `.env` tem `KEY_NVIDIA`.
