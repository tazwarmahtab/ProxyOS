# Project Coding Rules (Non-Obvious Only)

## Backend Architecture

- **Dual server files exist**: `server.js` (root) and `apps/backend/server.js`. Primary is `apps/backend/server.js`.
- **Port 7860**: Default port is 7860, not 3000.

## LLM Provider Integration

- Provider failover via [`apps/backend/providers/failover-manager.js`](apps/backend/providers/failover-manager.js)
- Priority: nvidia → groq → zai → github-copilot → opencode → openrouter → anthropic
- Circuit breaker: 5 failures → OPEN, 30s reset
- When adding providers, update both `failover-manager.js` AND `provider-checks.js`

## Adapter Communication

- Adapters run as separate processes: `npm run start:telegram` or `npm run start:slack`
- Communication via HTTP POST to `/api/inbound-message`

## Logging

```javascript
console.log('[ProxyOS backend] Message');  // Server logs
console.log('[ProxyOS] Provider message'); // Provider/agent logs
```
