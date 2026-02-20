# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical Architecture Notes

**Dual Server Structure**: Both root `server.js` AND `apps/backend/server.js` exist. The primary backend is `apps/backend/server.js` - root `server.js` is a simpler version. Always check which you're modifying.

**ES Modules**: All backend files use `"type": "module"` - use `import`/`export` syntax, not `require()`.

**Default Port**: 7860 (not 3000). Set via `PORT` environment variable.

## LLM Provider Failover System

Located in [`apps/backend/providers/`](apps/backend/providers/). Uses circuit breaker pattern with priority order:
1. nvidia (default) → groq → zai → opencode → openrouter
2. Falls back to OpenClaw cloud API if all local providers fail

Provider configurations in [`apps/backend/providers/configs/providers.json`](apps/backend/providers/configs/providers.json).

## Agent System

Three agents with soul/memory markdown files in [`agents/`](agents/) and [`apps/backend/agents/`](apps/backend/agents/):
- **minion**: Technical execution (code, scripts, deployment)
- **scout**: Research & intel gathering
- **sage**: Strategy & QA review

Database table `agent_memories` stores soul_markdown and memory_markdown columns.

## Adapter Architecture

Telegram/Slack adapters communicate with backend via HTTP to `/api/inbound-message`, not direct imports. Each adapter runs independently and can be started separately:
```bash
npm run start:telegram  # adapters/telegram.js
npm run start:slack     # adapters/slack.js
```

## Context Storage

Currently in-memory `Map()` with note to use Redis in production. Located in [`apps/backend/server.js`](apps/backend/server.js:32).

## Logging Convention

Use prefixes: `[ProxyOS backend]` for server logs, `[ProxyOS]` for provider/agent logs, `[Telegram Adapter]` for adapter logs.

## Testing

No test framework configured. When adding tests, use Vitest or Jest.

## Cursor Rules

See [`.cursor/rules/`](.cursor/rules/) for TypeScript, security, testing, API, database, and git commit standards.
