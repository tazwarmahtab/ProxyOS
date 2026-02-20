# AGENTS.md

This file provides guidance to agents when working in this repository.

## Critical Architecture

- **Dual servers**: Root `server.js` and `apps/backend/server.js` - primary is `apps/backend/`
- **Port**: 7860 (not 3000)
- **ES Modules**: Use `import`/`export`, not `require()`

## LLM Providers

Priority: nvidia → groq → zai → github-copilot → opencode → openrouter → anthropic (Claude)

Fallback: OpenClaw cloud at `https://taz7770-proxyos-openclaw.hf.space/api/agent`

## Adapters

Telegram/Slack communicate via HTTP POST to `/api/inbound-message`:
```bash
npm run start:telegram
npm run start:slack
```

## Context

In-memory `Map()` in `apps/backend/server.js:32` - needs Redis for production

## Logging

`[ProxyOS backend]` - server, `[ProxyOS]` - provider/agent, `[Telegram Adapter]` - adapters
