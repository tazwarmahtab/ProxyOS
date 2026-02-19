# ProxyOS Messaging Adapters

Lightweight adapters that connect messaging platforms to the ProxyOS backend.

## Architecture

```
User (Telegram/Slack)
  → Adapter receives message
  → POST /api/inbound-message (ProxyOS backend)
  → Tasks created → Agents execute
  → Adapter polls for result
  → Reply sent back to user
```

## Telegram Adapter

### Setup

1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Copy the bot token
3. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   PROXYOS_BACKEND_URL=http://localhost:3000
   ```

### Run

```bash
npm run start:telegram
```

### Features

- Handles text messages (non-command)
- `/start` - Welcome message
- `/help` - Help information
- Auto-truncates long responses (4000 char limit)
- Replies in threads when applicable

## Slack Adapter

### Setup

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Socket Mode (recommended) or configure Events API
3. Add bot token scopes: `app_mentions:read`, `chat:write`, `reactions:write`, `reactions:read`
4. Install app to workspace
5. Add to `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_APP_TOKEN=xapp-your-app-token  # For Socket Mode
   PROXYOS_BACKEND_URL=http://localhost:3000
   ```

### Run

```bash
npm run start:slack
```

### Features

- Handles direct messages and mentions
- `/proxyos` slash command
- Reacts with :thinking_face: while processing
- Replies in threads
- Auto-truncates long responses (3500 char limit)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram | Bot token from @BotFather |
| `SLACK_BOT_TOKEN` | Slack | Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack | App Signing Secret |
| `SLACK_APP_TOKEN` | Slack | App-Level Token (Socket Mode) |
| `PROXYOS_BACKEND_URL` | Both | ProxyOS backend URL (default: http://localhost:7860) |
| `SUPABASE_URL` | Both | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Both | Supabase service role key |

## Running Multiple Adapters

You can run all adapters together with the backend:

```bash
# Terminal 1 - Backend
npm start

# Terminal 2 - Telegram
npm run start:telegram

# Terminal 3 - Slack
npm run start:slack
```

Or use a process manager like PM2:

```bash
pm2 start server.js --name proxyos-backend
pm2 start adapters/telegram.js --name proxyos-telegram
pm2 start adapters/slack.js --name proxyos-slack
```

## API Contract

Adapters communicate with ProxyOS via:

### POST /api/inbound-message

```json
{
  "raw_input": "user message",
  "channel": "telegram" | "slack",
  "channel_user_id": "user_id",
  "reply_metadata": {
    "chat_id": 123,
    "channel_id": "C12345"
  }
}
```

Returns: `{ "status": "success", "context_id": "uuid" }`

### GET /api/context/:id/result

Returns when complete:
```json
{
  "context_id": "uuid",
  "status": "completed",
  "aggregated_text": "Agent response..."
}
```

Returns 202 if still processing.

## Troubleshooting

### Telegram bot not responding

1. Check `TELEGRAM_BOT_TOKEN` is correct
2. Ensure bot is not blocked by user
3. Check backend is running and accessible

### Slack bot not responding

1. Verify bot is added to the channel
2. Check all OAuth scopes are granted
3. For Socket Mode, verify `SLACK_APP_TOKEN`
4. Check backend is running and accessible

### Messages processing but no reply

1. Check backend logs for task execution
2. Verify Supabase connection
3. Check `outbound_deliveries` table for status
