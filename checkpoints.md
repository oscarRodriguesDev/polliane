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

## Sessão 3 — Nova personalidade (ousada, humana, concisa)
- Estado: FEITO. Build OK, teste real OK.
- Mudanças: `personalidade.md` reescrito (foco nela, não entrevista, respostas curtas, interage de igual para igual, corresponda investidas). `ai.ts`: max_tokens 200, temperature 0.9, regras reforçadas no system prompt.
- Limpeza: histórico antigo deletado do `data/chat.db` (poluía respostas).
- Pendências: decidir idade da personagem para liberar sedução explícita (hoje 17, bloqueada).

## Sessão 4 — Idade 22, humanização, opinião própria, "eu sou real"
- Estado: FEITO. Build OK, testes reais OK.
- Mudanças:
  - Idade 17 → 22 (maior de idade; sedução adulta liberada).
  - `personalidade.md`: "Como ela escreve" (celular, gírias), "Como ela seduz" (adulta), "Vida adulta" (apartamento, Dandara), "Ela tem opinião própria" (discorda, xinga leve, tem dúvidas), "Ela é REAL" (defende com unhas e dentes que é pessoa).
  - `ai.ts`: regras de flerte adulto, opinião própria, "VOCÊ É UMA PESSOA REAL", anti-sermão, escrita de celular. max_tokens 250.
  - `route.ts`: persistência DESLIGADA — histórico em memória (Map), sem SQLite. `data/chat.db` deletado.
- Testes reais: chamada de bot → indignação e defesa; besteira → discordou com atitude; flerte → correspondeu (anti-sermão adicionado depois).
- Pendências: persistência em disco desligada de propósito (modo teste da personalidade). Decidir depois se volta SQLite.

## Sessão 5 — OpenAI gpt-4o-mini + modo claro + reset + redesign da UI
- Estado: FEITO (build OK). Validação runtime fica com o usuário (ele roda o servidor).
- Motor principal: OpenAI `gpt-4o-mini` (`OPENAI_MODEL` via env), chave `OPENAI_API_KEY ?? OPENIAI_API_KEY` no `.env` (typo). NVIDIA vira fallback.
- `route.ts`: `DELETE /api/chat` zera o histórico (reset / estaca zero).
- `globals.css`: `@custom-variant dark` + keyframes (fadeIn, haloDrift) + scrollbar custom.
- `Chat.tsx`: redesign premium — toggle claro/escuro (localStorage), botão Resetar com confirmação, avatar gradiente, halos animados, bolhas com avatares, "digitando", sugestões de início.
- Pendências: testar a chave OpenAI em runtime; corrigir o typo `OPENIAI_API_KEY` → `OPENAI_API_KEY` no `.env` (opcional, código já aceita os dois).

## Sessão 13 — Anti-entrevista reforçado
- Estado: FEITO. Build OK.
- Queixa: entrevista em sequência + resposta curta gerava mais pergunta.
- Mudanças: `ai.ts` (REGRA DA PERGUNTA ÚNICA + "NUNCA entreviste" reforçado), `personalidade.md` (Como ela interage + Forma de conversar).
- Pendência: validar em runtime (usuário roda o servidor).

## Sessão 14 — Vida própria (não vive em função de ninguém)
- Estado: FEITO. Build OK.
- Queixa: parecia não ter vida própria, sempre à espera, sem problemas/emoções próprios.
- Mudanças: `ai.ts` (VIDA PRÓPRIA, COISAS PRA CONTAR, PROBLEMAS, EMOÇÕES próprias, AGENDA, sedução = desejo sem dependência), `personalidade.md` (seção "Vida própria").
- Pendência: validar em runtime (usuário roda o servidor).

## Sessão 15 — Sem filtro (palavrão + sexo aberto, fim do tom de assistente)
- Estado: FEITO. Build OK.
- Mudanças: `ai.ts` (SEM FILTRO, NUNCA ATENDENTE, SEXO SEM RODEIO, MENINA REAL, você não é assistente), `personalidade.md` (Como ela escreve + Como ela seduz).
- ⚠️ Pendência CRÍTICA: `gpt-4o-mini` (OpenAI) modera conteúdo — pode segurar palavrão/sexo explícito mesmo com prompt certo. Se travado no teste real, trocar para NVIDIA `deepseek-v4-flash`. Aguardando decisão do usuário.

## Sessão 16 — Botão OpenAI ↔ DeepSeek
- Estado: FEITO. Build OK.
- Mudanças: `ai.ts` (Provider + generateReply com ordem por provedor), `route.ts` (provider no POST), `Chat.tsx` (toggle no header, persistido em localStorage).
- ⚠️ Pendência: `.env` sem chave OpenAI — toggles caem ambos no NVIDIA até adicionar `OPENAI_API_KEY`. Validação runtime com o usuário.
