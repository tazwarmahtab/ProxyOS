# Project Coding Rules (Non-Obvious Only)

## Backend Architecture

- **Dual server files exist**: `server.js` (root) and `apps/backend/server.js`. Primary is `apps/backend/server.js`.
- **ES Modules required**: All backend uses `"type": "module"` - never use `require()`.
- **Port 7860**: Default port is 7860, not 3000.

## LLM Provider Integration

- Provider failover is automatic via [`apps/backend/providers/failover-manager.js`](apps/backend/providers/failover-manager.js)
- Priority: nvidia → groq → zai → opencode → openrouter → OpenClaw cloud
- Circuit breaker pattern: 5 failures triggers OPEN state, 30s reset timeout
- When adding new providers, update both `failover-manager.js` AND `provider-checks.js`

## Adapter Communication

- Telegram/Slack adapters DO NOT import backend directly
- Communication via HTTP POST to `/api/inbound-message`
- Adapters run as separate processes: `npm run start:telegram` or `npm run start:slack`

## Database Patterns

- `agent_memories` table stores markdown content in `soul_markdown` and `memory_markdown` columns
- Realtime publications configured for: `agent_tasks`, `proxy_context`, `proxy_stats`, `outbound_deliveries`
- Context storage is currently in-memory `Map()` - needs Redis for production

## Logging Format

```javascript
console.log('[ProxyOS backend] Message');  // Server logs
console.log('[ProxyOS] Provider message'); // Provider/agent logs
console.log('[Telegram Adapter] Message'); // Adapter logs
```

## Agent System

- Three agents: `minion` (code), `scout` (research), `sage` (QA)
- Soul files in `agents/*/soul.md` define agent personality
- Memory files in `agents/*/memory.md` track recent work
- Agent roles validated in DB via CHECK constraint: `('minion','scout','sage')`
