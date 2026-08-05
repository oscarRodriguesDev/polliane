# Tutorial: Bot da Pollianne no Telegram

Este tutorial mostra como colocar a Pollianne para conversar **dentro do Telegram**,
usando o mesmo motor do chat interno (mesma personalidade, humor do dia, fotos).

---

## 1. Pré-requisitos

- Projeto rodando com `npm run dev` (ou build de produção).
- Acesso a uma **URL pública com HTTPS** para receber as mensagens do Telegram.
  O Telegram **não aceita** endereços `localhost`. Opções:
  - **[ngrok](https://ngrok.com)** (recomendado pra teste local):
    ```
    ngrok http 3000
    ```
    Isso gera algo como `https://abcd-12-34-56-78.ngrok-free.app`.
  - Um servidor/VPS com domínio e HTTPS (produção).

> Nota: no Windows, use o executável `ngrok.exe` baixado do site. O endereço muda a
> cada execução gratuita — você precisará re-registrar o webhook quando ele trocar.

---

## 2. Criar o bot no Telegram (@BotFather)

1. Abra o Telegram e pesquise por **@BotFather** (perfil oficial com selo azul).
2. Envie o comando:
   ```
   /newbot
   ```
3. Informe o **nome** do bot (ex.: `Pollianne`).
4. Informe o **username** do bot, obrigatoriamente terminado em `bot`
   (ex.: `pollianne_bot`).
5. O BotFather responde com uma mensagem contendo:
   ```
   Use this token to access the HTTP API:
   1234567890:AAHf...xyz
   ```
   Copie esse token.

---

## 3. Configurar o token no projeto

1. Abra o arquivo `.env` na raiz do projeto.
2. Adicione (ou preencha) a linha:
   ```
   TELEGRAM_BOT_TOKEN=1234567890:AAHf...xyz
   ```
   Troque pelo token que o BotFather te deu.
3. **Reinicie** o `npm run dev` para o projeto ler a nova variável.
   (É só parar com `Ctrl+C` e rodar de novo.)

---

## 4. Registrar o webhook

O webhook já está implementado no projeto, na rota:

```
POST /api/telegram
```

Para registrar, abra no navegador (ou `curl`) o endereço abaixo,
**substituindo** a URL pública pelo seu endereço real:

```
http://localhost:3000/api/telegram?set=<URL_PUBLICA>/api/telegram
```

Exemplo com ngrok:

```
http://localhost:3000/api/telegram?set=https://abcd-12-34-56-78.ngrok-free.app/api/telegram
```

> **Importante:** a URL do webhook deve apontar para **fora** (a URL pública),
> não para o localhost. O Telegram só envia mensagens para URLs públicas com HTTPS.

O navegador deve mostrar algo como:

```json
{ "ok": true, "result": { "ok": true, "description": "Webhook was set" } }
```

### Comandos de gerenciamento (opcional)

| Ação                    | URL                                                        |
|-------------------------|------------------------------------------------------------|
| Ver estado do webhook   | `http://localhost:3000/api/telegram?info=1`                |
| Remover o webhook       | `http://localhost:3000/api/telegram?delete=1`              |

---

## 5. Testar

1. No Telegram, abra a conversa com o username do seu bot
   (ex.: `t.me/pollianne_bot`).
2. Envie `/start` — a Pollianne deve responder uma mensagem de boas-vindas.
3. Mande qualquer mensagem (ex.: "oi, como cê tá?") — ela responde com a
   personalidade normal, incluindo humor do dia e fotos quando a conversa pede.

---

## 6. Comandos disponíveis no bot

| Comando     | Efeito                                                        |
|-------------|---------------------------------------------------------------|
| `/start`    | Mensagem de boas-vindas                                       |
| `/reset`    | Apaga a memória da conversa daquele chat (começa do zero)     |
| `/estado`   | Mostra o temperamento e as emoções do dia                     |

---

## 6.1 Foto de perfil do bot

> ⚠️ **A Bot API do Telegram NÃO tem método para trocar a foto do bot.** A única
> forma é manual, pelo **@BotFather** (mesmo lugar onde o bot foi criado):

1. Abra o Telegram e pesquise **@BotFather**.
2. Envie o comando `/setuserpic`.
3. Escolha o bot (ex.: `pollianne_bot`).
4. Envie o arquivo de imagem — use o `profile.jpeg` do projeto:
   ```
   public/polli/leves/profile.jpeg
   ```
5. Pronto: o bot mostra a foto nova no perfil e nas conversas.

> As fotos que o bot **manda nas conversas** não têm nada a ver com a foto de
> perfil: elas vêm de `public/polli/leves/` (leves) e `public/polli/picantes/`
> (picantes), escolhidas automaticamente conforme a conversa esquenta.

---

## 7. Como funciona por baixo dos panos

- **`src/app/api/telegram/route.ts`** — recebe os updates do Telegram
  (`POST`) e gerencia o webhook (`GET` com `?set=`, `?delete=`, `?info=`).
- **`src/lib/telegram.ts`** — engine do bot:
  - mantém **uma conversa por chat_id** (histórico separado por usuário);
  - usa `generateReply` (mesma IA do chat interno);
  - detecta `[[FOTO: cena]]` e envia foto real do Unsplash via `sendPhoto`;
  - aplica o mesmo drift emocional (`applyEmotionChange`) do chat interno.
- **`.env`** — guarda o `TELEGRAM_BOT_TOKEN`.

Isso significa que a personalidade, o temperamento e as fotos são **os mesmos**
do site — o Telegram é só uma "porta de entrada" extra pra mesma Pollianne.

---

## 8. Solução de problemas

| Problema                                   | Solução                                                              |
|--------------------------------------------|----------------------------------------------------------------------|
| `TELEGRAM_BOT_TOKEN não definido`          | Preencha o token no `.env` e reinicie o `npm run dev`.               |
| `webhook was not set` / `Bad Request`      | A URL precisa ser pública e HTTPS. Gere outra com ngrok e re-registre.|
| O bot não responde nada                    | Verifique o webhook com `?info=1` e o terminal (log do Next.js).     |
| `404 page not found` no endpoint do bot    | Confira que a URL pública termina em `/api/telegram`.                |
| Resposta demora muito                      | Normal — a IA e a busca de foto levam alguns segundos.               |
| Foto não chega                             | Se o Unsplash não achar a cena, ele envia só o texto. Teste cenas simples ("foto de lingerie"). |
