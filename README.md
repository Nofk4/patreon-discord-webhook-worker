# Patreon → Discord com Cloudflare Worker

Publica automaticamente uma mensagem no Discord quando um post novo é publicado no Patreon.

Não usa bot tradicional, Discord Bot Token, VPS ou processo ligado 24 horas. O fluxo é:

```text
Post novo no Patreon
        ↓
Patreon Webhook (posts:publish)
        ↓
Cloudflare Worker
        ↓
Discord Webhook
```

A mensagem enviada fica assim:

```md
## [Check out on Patreon](LINK_EXATO_DO_POST)
## Título do post @Cargo
```

O Worker não envia imagem, descrição ou embed.

## O que você precisa

- Uma página de criador no Patreon.
- Um servidor do Discord no qual você possa criar cargos e webhooks.
- Uma conta gratuita da Cloudflare.
- Node.js 18 ou mais recente somente se escolher a instalação pelo terminal.

## 1. Criar o cargo no Discord

1. Abra o servidor.
2. Entre em **Configurações do servidor → Cargos**.
3. Crie o cargo que será marcado, por exemplo `Member`.
4. Ative **Permitir que qualquer pessoa mencione este cargo**.
5. Dê o cargo às pessoas que devem receber a notificação.
6. Em **Configurações de usuário → Avançado**, ative o **Modo desenvolvedor**.
7. Clique com o botão direito no cargo e escolha **Copiar ID do cargo**.

O ID é um número parecido com `1221213587410784377`. Ele não é uma senha.

## 2. Criar o webhook do Discord

1. Abra **Editar canal → Integrações → Webhooks**.
2. Clique em **Novo webhook**.
3. Escolha nome, avatar e canal.
4. Clique em **Copiar URL do webhook**.

> [!CAUTION]
> A URL do webhook funciona como uma senha. Não envie em chats, prints, commits ou issues do GitHub.

## 3. Configurar o projeto

Edite `wrangler.jsonc`:

```jsonc
"vars": {
  "WEBHOOK_NAME": "Naoki",
  "DISCORD_ROLE_ID": "ID_DO_CARGO",
  "PATREON_VANITY": "NOME_DA_SUA_PAGINA"
}
```

`PATREON_VANITY` é a parte do endereço depois de `patreon.com/`. Por exemplo, para `patreon.com/Nobafka`, use `Nobafka`.

Não coloque `DISCORD_WEBHOOK_URL` nem `PATREON_WEBHOOK_SECRET` no `wrangler.jsonc`.

## 4. Implantar pelo terminal

```powershell
git clone https://github.com/Nofk4/patreon-discord-webhook-worker.git
cd patreon-discord-webhook-worker
npm install
npx wrangler login
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler deploy
```

Quando `wrangler secret put` pedir o valor, cole somente a URL pura copiada do Discord:

```text
https://discord.com/api/webhooks/ID/TOKEN
```

Não coloque aspas, Markdown ou `DISCORD_WEBHOOK_URL=` junto.

O deploy mostrará uma URL parecida com:

```text
https://patreon-discord-webhook-worker.seu-subdominio.workers.dev
```

Abra essa URL. O JSON deverá mostrar `discordConfigured: true` e `patreonConfigured: false`.

## 5. Criar o webhook no Patreon

1. Abra [Patreon Platform — My Webhooks](https://www.patreon.com/portal/registration/register-webhooks).
2. Entre com a conta que administra sua página de criador.
3. Clique em **Create Webhook**, **Register Webhook** ou **Add Webhook**.
4. No campo `URI`/`Webhook URL`, cole a URL pública do Worker.
5. Selecione sua campanha.
6. Marque somente o evento `posts:publish`.
7. Salve.
8. Abra os detalhes do webhook e copie o `Secret`.

Não compartilhe o secret do Patreon.

## 6. Adicionar o secret do Patreon

No terminal, dentro do projeto:

```powershell
npx wrangler secret put PATREON_WEBHOOK_SECRET
```

Cole o secret quando solicitado. Depois abra novamente a URL do Worker. O resultado deverá conter:

```json
{
  "discordConfigured": true,
  "patreonConfigured": true
}
```

## 7. Testar

1. Abra o webhook no painel do Patreon.
2. Use **Send Test** ou **Test Webhook**.
3. Selecione `posts:publish`.
4. Confira o canal do Discord.

O teste do Patreon pode usar título e ID fictícios. Uma publicação real contém o ID do post recém-publicado e gera o link correto.

## Instalação somente pelo painel da Cloudflare

Se você não quiser usar o terminal:

1. Abra **Workers & Pages** no painel da Cloudflare.
2. Crie um Worker.
3. Abra **Edit code**.
4. Copie todo o conteúdo de `src/index.js`, substitua o código existente e faça o deploy.
5. Em **Settings → Variables and Secrets**, adicione como texto:
   - `WEBHOOK_NAME`
   - `DISCORD_ROLE_ID`
   - `PATREON_VANITY`
6. Adicione como **Secret**:
   - `DISCORD_WEBHOOK_URL`
   - `PATREON_WEBHOOK_SECRET`
7. Faça outro deploy caso o painel solicite.

## Personalização

As opções públicas ficam em `wrangler.jsonc` ou em **Variables and Secrets**:

| Variável | Exemplo | Função |
| --- | --- | --- |
| `WEBHOOK_NAME` | `Naoki` | Nome exibido pelo webhook |
| `DISCORD_ROLE_ID` | `1221213587410784377` | Cargo marcado na mensagem |
| `PATREON_VANITY` | `Nobafka` | Nome usado para construir a URL do post |

## Segurança

- O Worker valida `X-Patreon-Signature` antes de processar o evento.
- Apenas o ID configurado em `allowed_mentions.roles` pode gerar uma menção.
- Secrets não ficam no código nem no `wrangler.jsonc`.
- `.dev.vars`, `.env` e arquivos equivalentes estão no `.gitignore`.
- Se uma URL do Discord vazar, apague ou regenere o webhook imediatamente.

## Solução de problemas

### `401 Assinatura inválida`

O valor de `PATREON_WEBHOOK_SECRET` está incorreto. Copie novamente o secret do mesmo webhook que aponta para este Worker.

### `500 Invalid URL string`

O valor de `DISCORD_WEBHOOK_URL` não é uma URL pura. Copie novamente pelo Discord e remova aspas, Markdown ou nomes de variável.

### `502 O Discord recusou a mensagem`

O webhook pode ter sido apagado, regenerado ou estar apontando para um canal sem acesso.

### O cargo aparece, mas ninguém recebe notificação

Confirme que o cargo está configurado como mencionável e foi atribuído aos membros corretos.

### O teste abre uma página genérica ou um post inexistente

O teste do Patreon pode usar um payload fictício. Em posts reais, o Worker prefere a URL recebida no evento e, se ela não vier, constrói a URL usando o título, o ID real do post e `PATREON_VANITY`.

## Comandos úteis

```powershell
npm run check
npm run dev
npm run deploy
npx wrangler tail
```

## Licença

MIT. Veja `LICENSE`.
