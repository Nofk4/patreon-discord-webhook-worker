# Patreon → Discord with a Cloudflare Worker

Automatically posts a Discord message whenever a new Patreon post is published.

This project does not require a traditional Discord bot, a Discord bot token, a VPS, or a process running 24/7. The flow is:

```text
New Patreon post
        ↓
Patreon Webhook (posts:publish)
        ↓
Cloudflare Worker
        ↓
Discord Webhook
```

The message sent to Discord looks like this:

```md
## [Check out on Patreon](EXACT_POST_URL)
## Post title @Role
```

The Worker does not send an image, description, or embed.

## Requirements

- A Patreon creator page.
- A Discord server where you can create roles and webhooks.
- A free Cloudflare account.
- Node.js 18 or newer only if you choose the command-line setup.

## 1. Create the Discord role

1. Open your Discord server.
2. Go to **Server Settings → Roles**.
3. Create the role that should be mentioned, such as `Member`.
4. Enable **Allow anyone to mention this role**.
5. Assign the role to everyone who should receive the notification.
6. Go to **User Settings → Advanced** and enable **Developer Mode**.
7. Right-click the role and select **Copy Role ID**.

The ID is a number similar to `1221213587410784377`. It is not a password.

## 2. Create the Discord webhook

1. Open **Edit Channel → Integrations → Webhooks**.
2. Click **New Webhook**.
3. Choose its name, avatar, and channel.
4. Click **Copy Webhook URL**.

> [!CAUTION]
> The webhook URL works like a password. Never share it in chats, screenshots, Git commits, or GitHub issues.

## 3. Configure the project

Edit `wrangler.jsonc`:

```jsonc
"vars": {
  "WEBHOOK_NAME": "YOUR_WEBHOOK_NAME",
  "DISCORD_ROLE_ID": "YOUR_ROLE_ID",
  "PATREON_VANITY": "YOUR_PAGE_NAME"
}
```

`PATREON_VANITY` is the part of your creator page URL after `patreon.com/`. For example, use `Nobafka` for `patreon.com/Nobafka`.

Do not put `DISCORD_WEBHOOK_URL` or `PATREON_WEBHOOK_SECRET` in `wrangler.jsonc`.

## 4. Deploy from the command line

```powershell
git clone https://github.com/Nofk4/patreon-discord-webhook-worker.git
cd patreon-discord-webhook-worker
npm install
npx wrangler login
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler deploy
```

When `wrangler secret put` asks for the value, paste only the raw URL copied from Discord:

```text
https://discord.com/api/webhooks/ID/TOKEN
```

Do not include quotes, Markdown, or `DISCORD_WEBHOOK_URL=`.

The deployment will display a URL similar to:

```text
https://patreon-discord-webhook-worker.your-subdomain.workers.dev
```

Open that URL. The JSON response should show `discordConfigured: true` and `patreonConfigured: false`.

## 5. Create the Patreon webhook

1. Open [Patreon Platform — My Webhooks](https://www.patreon.com/portal/registration/register-webhooks).
2. Sign in with the account that manages your creator page.
3. Click **Create Webhook**, **Register Webhook**, or **Add Webhook**.
4. Paste the public Worker URL into the `URI` or `Webhook URL` field.
5. Select your campaign.
6. Enable only the `posts:publish` event.
7. Save the webhook.
8. Open its details and copy the `Secret`.

Do not share the Patreon secret.

## 6. Add the Patreon secret

Run this command from the project directory:

```powershell
npx wrangler secret put PATREON_WEBHOOK_SECRET
```

Paste the secret when prompted. Open the Worker URL again. The response should now contain:

```json
{
  "discordConfigured": true,
  "patreonConfigured": true
}
```

## 7. Test the integration

1. Open the webhook in the Patreon dashboard.
2. Use **Send Test** or **Test Webhook**.
3. Select `posts:publish`.
4. Check your Discord channel.

Patreon's test event may contain a placeholder title and post ID. A real publication contains the newly published post ID and produces the correct direct link.

## Cloudflare dashboard-only setup

If you do not want to use the command line:

1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Create a Worker.
3. Open **Edit code**.
4. Copy the entire contents of `src/index.js`, replace the existing code, and deploy it.
5. Under **Settings → Variables and Secrets**, add these as plain-text variables:
   - `WEBHOOK_NAME`
   - `DISCORD_ROLE_ID`
   - `PATREON_VANITY`
6. Add these as **Secrets**:
   - `DISCORD_WEBHOOK_URL`
   - `PATREON_WEBHOOK_SECRET`
7. Deploy again if the dashboard asks you to do so.

## Customization

Public configuration options can be set in `wrangler.jsonc` or under **Variables and Secrets**:

| Variable | Example | Purpose |
| --- | --- | --- |
| `WEBHOOK_NAME` | `Naoki` | Name displayed by the Discord webhook |
| `DISCORD_ROLE_ID` | `1221213587410784377` | Role mentioned in the message |
| `PATREON_VANITY` | `Nobafka` | Creator page name used to build the post URL |

## Security

- The Worker validates `X-Patreon-Signature` before processing an event.
- Only the role ID configured in `allowed_mentions.roles` can generate a mention.
- Secrets are never stored in the source code or `wrangler.jsonc`.
- `.dev.vars`, `.env`, and equivalent local files are included in `.gitignore`.
- If a Discord webhook URL leaks, delete or regenerate the webhook immediately.

## Troubleshooting

### `401 Invalid signature`

The `PATREON_WEBHOOK_SECRET` value is incorrect. Copy the secret again from the same Patreon webhook that points to this Worker.

### `500 Invalid URL string`

The `DISCORD_WEBHOOK_URL` value is not a raw URL. Copy it again from Discord and remove quotes, Markdown, or variable names.

### `502 Discord rejected the message`

The webhook may have been deleted, regenerated, or configured for a channel it can no longer access.

### The role is displayed, but nobody receives a notification

Make sure the role is mentionable and assigned to the correct members.

### The test opens a generic page or a post that does not exist

Patreon's test payload may contain placeholder data. For real posts, the Worker prefers the URL included in the event. If it is unavailable, the Worker builds the URL from the post title, real post ID, and `PATREON_VANITY`.

## Useful commands

```powershell
npm run check
npm run dev
npm run deploy
npx wrangler tail
```

## License

MIT. See `LICENSE`.
