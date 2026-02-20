# Project Debug Rules (Non-Obvious Only)

## Common Failure Points

**LLM Provider Failures**:
- Check circuit breaker state in [`apps/backend/providers/failover-manager.js`](apps/backend/providers/failover-manager.js)
- Providers auto-disable after 5 consecutive failures
- Circuit breaker resets after 30 seconds
- Final fallback is OpenClaw cloud at `https://taz7770-proxyos-openclaw.hf.space/api/agent`

**Adapter Connection Issues**:
- Adapters connect to backend via `PROXYOS_BACKEND_URL` env var
- Default: `https://taz7770-proxyos-backend.hf.space`
- Check `/api/inbound-message` endpoint for adapter payloads

**Context Loss**:
- Context stored in-memory `Map()` in [`apps/backend/server.js:32`](apps/backend/server.js:32)
- Server restart = all context lost
- Look for "use Redis in production" comment

## Logging Locations

- Backend: Console with `[ProxyOS backend]` prefix
- Providers: Console with `[ProxyOS]` prefix  
- Adapters: Console with `[Telegram Adapter]` or `[Slack Adapter]` prefix

## Database Debugging

- Supabase realtime enabled for: `agent_tasks`, `proxy_context`, `proxy_stats`, `outbound_deliveries`
- Check `outbound_deliveries` table for pending/sent message status
- Agent locks in `agent_locks` table (distributed lane locking)

## Environment Variables Required

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
NVIDIA_API_KEY (primary provider)
GROQ_API_KEY (fallback)
ZAI_API_KEY (fallback)
OPENCODE_API_KEY (fallback)
OPENROUTER_API_KEY (fallback)
PORT=7860
```

## Silent Failures to Watch

- Empty `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` logs warning but doesn't exit
- Missing provider API keys cause silent skip to next provider
- Adapter missing `TELEGRAM_BOT_TOKEN` exits with code 1
