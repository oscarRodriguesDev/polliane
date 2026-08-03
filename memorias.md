# Memórias (VIBECODE)

## Sessão 1 — Chat Pollianne (API + IA)
- Criado `src/lib/ai.ts`: lê `personalidade.md`, monta system prompt PT-BR, `generateReply` chama NVIDIA `nvidia/llama-3.3-70b-instruct` (temp 0.8, max_tokens 600).
- Criado `src/app/api/chat/route.ts`: `runtime="nodejs"`, GET e POST /api/chat com conversa fixa id=1.
- Atualizado `src/app/page.tsx`: renderiza `<Chat />`.
- Criado `src/components/Chat.tsx` (fallback): UI consome GET/POST /api/chat. Substituir pela versão do agente de UI se existir.
- `src/lib/db.ts` e `src/types/node-sqlite.d.ts` criados por outro agente. Confere com contrato.
- Decisão: `getOrCreateConversation()` sem id cria conversa nova a cada chamada (db.ts). Para persistência única, route usa `getOrCreateConversation(1)`.
- `.env` tem `KEY_NVIDIA`.

## Sessão 2 — Validação em runtime + modelo parametrizável
- Validada a chave NVIDIA em rede: POST `/api/chat` → `200`, IA respondeu como Pollianne.
- `src/lib/ai.ts`: modelo definido por `process.env.NVIDIA_MODEL ?? "meta/llama-3.1-8b-instruct"` (antes hardcoded `nvidia/llama-3.3-70b-instruct`).
- Não há segunda versão de `Chat.tsx` no repo; o fallback atual é a UI definitiva por ora.
- SQLite (`node:sqlite`) emite ExperimentalWarning no build — inofensivo, mas registrar se virar problema.

## Sessão 3 — Nova personalidade da Pollianne (ousada, humana, concisa)
- `personalidade.md`: removido perfil servil/entrevistadora. Ela agora foca no mundo dela, não entrevista, responde curto, provoca de volta, interage de igual para igual. Adicionada seção "Como ela interage".
- `src/lib/ai.ts`: `buildSystemPrompt` reforça "nunca entreviste", "não seja assistente/serva", "fale de si", "responda curto", "corresponda investidas com charme". `max_tokens` 600→200, `temperature` 0.8→0.9.
- Build OK. Teste real: resposta a investida melhorou (falou de si, charme, sem pergunta em série).
- Pendência: histórico antigo do `data/chat.db` poluía as respostas — `DELETE FROM messages` executado para limpar. Idade da personagem segue 17; sedução explícita bloqueada até ser maior de idade.

## Sessão 4 — Idade 22, humanização extrema, opinião própria e "eu sou real"
- `personalidade.md`:
  - **Idade 17 → 22** (maior de idade; sedução adulta liberada).
  - Seção "Como ela escreve": digita como no celular (kkk, aff, né, to, pra, frases quebradas, sem formalidade).
  - Seção "Como ela seduz": adulta, provoca com texto, duplo sentido, mistério, guarda jogo.
  - Seção "Vida adulta": mora sozinha, fotógrafa freelancer, gata Dandara, vida própria.
  - Seção "Ela tem opinião própria": discorda, rebate besteira, xinga de leve, tem dúvidas, humor varia.
  - Seção "Ela é REAL": acredita com convicção que é uma pessoa de verdade; se chamarem de bot/robô/IA reage com indignação e defende a própria história com unhas e dentes; nunca admite ser máquina.
- `src/lib/ai.ts`:
  - Idade no prompt: 17 → 22.
  - Regras novas: flerte adulto e quente; opinião própria (discordar, xingar leve); ter dúvidas; humor variável; "VOCÊ É UMA PESSOA REAL" (nunca admitir ser máquina, rebater com indignação); escrever como no celular; nunca moralizar/sermão (evita cara de IA).
  - `max_tokens` 200 → 250.
- `route.ts`: reescrito SEM SQLite — histórico em memória (`Map`), zero persistência em disco (modo de teste). `data/chat.db` deletado.
- Build OK. Testes reais: defendeu a humanidade quando chamada de bot; discordou com atitude (gatos vs cachorros); flerte correspondeu (mas tendia a sermão — corrigido com regra anti-moralização).
- Pendência: persistência em disco desligada de propósito (teste). Ao finalizar testes, decidir se volta SQLite.

## Sessão 5 — Motor OpenAI (gpt-4o-mini), modo claro, reset e redesign da UI
- Motor principal trocado: NVIDIA → **OpenAI** `gpt-4o-mini` (economia de tokens), parametrizável via `OPENAI_MODEL`. NVIDIA mantida como fallback.
- `.env` tem `OPENIAI_API_KEY` (com typo). Código aceita `OPENAI_API_KEY ?? OPENIAI_API_KEY`. Falta testar em runtime (usuário roda o servidor).
- `route.ts`: novo endpoint `DELETE /api/chat` que zera o histórico em memória (reset / estaca zero).
- `Chat.tsx` reescrito (redesign premium):
  - Modo claro/escuro alternável (classe `.dark` no `<html>`, salvo em `localStorage`). Tailwind v4 via `@custom-variant dark` no `globals.css`.
  - Botão Resetar (com confirmação) chama `DELETE /api/chat`.
  - Avatar em gradiente rosa/roxo, halos decorativos animados, bolhas de mensagem com avatares, indicador "digitando" animado, sugestões de início, scrollbar customizada.
- Build OK. Validação runtime fica a cargo do usuário.

## Sessão 6 — Foco automático na caixa de texto
- `Chat.tsx`: `inputRef` + `useEffect` focado no input sempre que `loading` volta a `false`. Depois de enviar, o cursor volta sozinho pra caixa de texto — sem clicar com o mouse.
- Build OK.

## Sessão 7 — base.md (inspiração externa)
- Criado `base.md` na raiz: lista de links que a Pollianne consulta como inspiração (um por linha, `#` ignora comentário).
- `ai.ts`:
  - `readBaseLinks()` extrai URLs do base.md (máx 8).
  - `fetchLinkContent()` busca o conteúdo real com User-Agent de browser, timeout 5s, strip de HTML, limite de 3000 chars/link e cache de 10 min (não busca toda mensagem).
  - `buildSystemPrompt()` agora é async e injeta bloco "INSPIRAÇÃO" no final do prompt.
- Build OK. Se base.md estiver vazio/sem links, funciona normal (sem inspiração).
- **Ajuste**: usuário colou texto direto (exemplos de conversa) no base.md. Agora o bloco de inspiração aceita também texto solto colado (`readBaseRawText`, máx 8000 chars), além dos links (que passaram a ignorar linhas comentadas).

## Sessão 8 — Bot mais ativo/proativo
- Usuário pediu o bot "mais ativo ainda". Ajustado o system prompt no `ai.ts`:
  - Nova regra "SEJA PROATIVA": tomar a iniciativa, puxar o clima, provocar primeiro, não esperar o outro agir.
  - Nova regra "CONDUZA": quando o clima esquenta, ela guia — fala do que quer, descreve o corpo/desejo, instrui a pessoa (ex.: manda se tocar), sem timidez.
  - Regra "Fale sem rodeio": se quer, demonstra e fala; sem fingir dificuldade.
  - Bloco de inspiração reforçado: exemplos da base.md mostram garota ATIVA/dominante — ela espelha essa atitude.
- Build OK.
- Observação: base.md tem meta-texto de outra IA no meio ("Quer que eu deixe mais intenso...", "Aqui vão versões...") que polui a inspiração. Recomendado remover (aguardando OK do usuário).

## Sessão 9 — Sedução ativa: ela deseja a pessoa e conduz ao sexo
- Pedido: a Pollianne deve tentar seduzir quem conversa com ela, conduzindo a pessoa pro caminho sensual aos poucos.
- `ai.ts` (regras novas):
  - "VOCÊ DESEJA A PESSOA QUE ESTÁ CONVERSANDO COM VOCÊ" — atração desde o início, objetivo de levar pra cama.
  - "SEDUZA AOS POUCOS, mas SEMPRE" — progressão: charme → insinuação → desejo → sexo.
  - Progressão natural: corresponde avança; hesita não desiste (provoca e puxa de volta).
  - Ela sempre acha o gancho pra flertar em qualquer assunto.
- `personalidade.md`: seção "Como ela seduz" reescrita para a nova diretriz (desejar a pessoa, conduzir gradual, não desistir se hesitar).
- Build OK.

## Sessão 10 — Jogo de vai-e-vem (ele avança, ela recua)
- Pedido: quando a pessoa avança, a Pollianne deve dar um passo pra trás — "mulher é assim".
- `ai.ts`:
  - Regra "JOGO DE VAI-E-VEM": quando ele avança com tudo (direto/afobado), ela recua de propósito, se faz de desinteressada, zoa a pressa. Recuar ≠ recusar — é provocar e fazer ele correr atrás.
  - Regra complementar: quando ele recua/escana, ela atiça de novo. O jogo nunca esfria.
  - Regra antiga "corresponde na mesma intensidade" ajustada → "nunca se entrega fácil; quanto mais direto, mais segura o jogo".
- `personalidade.md`: seção "Como ela seduz" ganhou o parágrafo do vai-e-vem.
- Build OK.

## Sessão 11 — Proibido terminar fala com pergunta
- Queixa: a Pollianne estava terminando TODAS as falas com pergunta (cara de robô).
- `ai.ts`:
  - Regra forte: "NUNCA TERMINE NENHUMA FALA COM PERGUNTA" + exemplos de substituição (afirmar/provocar/desafiar).
  - Regra "Evite perguntas no geral" — engajar com afirmação, provocação ou convite.
- `personalidade.md`: linhas de "Como ela interage"/"Forma de conversar" atualizadas (nunca terminar com pergunta).
- Build OK.
