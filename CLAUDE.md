# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ProxyOS is an AI agent swarm platform. A backend "brain" delegates tasks to specialized agents (Minion, Scout, Sage), accessible via a Next.js dashboard, Telegram, and Slack. It uses multiple LLM providers with automatic failover and circuit breaker patterns.

## Repository Structure

- **`apps/backend/`** — Primary Express backend (this is the main server, not root `server.js`)
- **`apps/web/`** — Next.js 14 App Router frontend (TypeScript, Tailwind, Three.js, Phaser)
- **`packages/shared/`** — Shared types and skin definitions (`@proxyos/shared`)
- **`infra/`** — Supabase schema (`supabase-schema.sql`)
- **`proxyos-openclaw/`** and **`Openclaw/`** — Separate git repos for OpenClaw integration (not core ProxyOS)
- Root `server.js` is a legacy standalone server; the primary backend is `apps/backend/server.js`

## Commands

### Backend (`apps/backend/`)
```bash
npm start              # Start backend server (port 7860)
npm run dev            # Same as start
npm run start:telegram # Start Telegram adapter
npm run start:slack    # Start Slack adapter
```

### Frontend (`apps/web/`)
```bash
npm run dev    # Next.js dev server
npm run build  # Production build
npm run lint   # ESLint
```

### Shared (`packages/shared/`)
```bash
npm run build  # TypeScript compile
```

### Docker (`apps/backend/`)
```bash
docker build -t proxyos-backend .
docker-compose up -d                          # Backend only
docker-compose --profile telegram up -d       # With Telegram adapter
```

## Architecture

### Request Flow
```
User (Web/Telegram/Slack) → Adapter (thin HTTP client) → POST /api/inbound-message → Backend delegates to agents → Agents execute via LLM → Results stored in Supabase → Adapter polls /api/context/:id/result
```

The web dashboard uses `POST /api/feed-context` directly. Both paths converge at the same delegation logic.

### LLM Provider Failover
Priority chain: nvidia (P1) → groq (P2) → zai (P3, free) → github-copilot (P4) → opencode (P5) → openrouter (P6) → anthropic (P7) → OpenClaw Cloud (final fallback)

Circuit breaker: 5 consecutive failures opens circuit for 30 seconds, then half-open test. Implementation in `apps/backend/providers/failover-manager.js`.

Provider configs: `apps/backend/providers/configs/providers.json`

### Agent Swarm
Three agents with distinct roles defined in `apps/backend/agents/*/soul.md`:
- **Minion** — Technical execution (code, scripts, deployment)
- **Scout** — Research and intelligence gathering
- **Sage** — Strategy and QA

### Data Layer
- **Supabase** — Postgres database with Realtime subscriptions on `agent_tasks`, `proxy_context`, `proxy_stats`, `outbound_deliveries`
- **Redis** — Context storage with 24h TTL, falls back to in-memory `Map()` (`apps/backend/lib/redis.js`)

### Frontend Architecture
- Next.js 14 App Router with Supabase Realtime for live updates
- Phaser for 2D office scene, Three.js/React Three Fiber for 3D isometric view
- Path aliases: `@/*` → `./src/*`, `@proxyos/shared/*` → `../../packages/shared/src/*`

### Adapters
Telegram and Slack adapters are thin clients that POST to `/api/inbound-message` and poll for results. They live in `apps/backend/adapters/`.

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/feed-context` | Feed context from web UI, auto-delegates to agents |
| POST | `/api/inbound-message` | Entry point for Telegram/Slack adapters |
| GET | `/api/context/:id/status` | Poll context processing status |
| GET | `/api/context/:id/result` | Get completed context result |
| GET | `/api/swarm-status` | Current swarm status |
| POST | `/api/assign-task` | Manual task assignment |
| POST | `/api/llm` | Direct LLM call |
| GET | `/api/providers/health` | Provider health checks |

## Conventions

- **ES Modules** throughout — use `import`/`export`, never `require()`
- **Port 7860** — not 3000 (HuggingFace Spaces convention)
- **Conventional commits** — `type(scope): subject` (feat, fix, docs, refactor, test, chore, perf, ci, revert)
- **Log prefixes** — `[ProxyOS backend]` for server, `[ProxyOS]` for provider/agent, `[Telegram Adapter]` / `[Slack Adapter]` for adapters
- **Cloud-only deployment** — Backend on HuggingFace Spaces (Docker), Frontend on Vercel, DB on Supabase, Gateway on Railway
- **Node.js 20** (`.nvmrc`)

## Environment Variables

Backend requires at minimum: `PORT` (7860), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and at least one LLM provider API key. See `apps/backend/.env.example` for the full list.

Frontend requires: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BACKEND_URL`.
