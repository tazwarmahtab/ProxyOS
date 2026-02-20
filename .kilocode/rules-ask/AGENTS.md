# Project Documentation Rules (Non-Obvious Only)

## Directory Structure Clarifications

**Dual Backend Servers**:
- `server.js` (root) - Simple standalone version
- `apps/backend/server.js` - Primary backend with full features
- Both exist; always clarify which is being discussed

**Agent Soul Files**:
- `agents/` directory contains soul/memory markdown files
- `apps/backend/agents/` is a duplicate location
- Both locations exist; check both when modifying agent personalities

**Openclaw Directory**:
- `Openclaw/` is a separate integrated project (OpenClaw AI assistant)
- Has its own extensions, docs, and configuration
- Not part of ProxyOS core but integrated for cloud fallback

## Key Documentation Files

- [`docs/START_HERE.md`](docs/START_HERE.md) - Project onboarding
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System overview
- [`infra/supabase-schema.sql`](infra/supabase-schema.sql) - Database schema with comments
- [`apps/backend/README.md`](apps/backend/README.md) - Backend-specific docs

## API Endpoints

All routes defined in single file [`apps/backend/server.js`](apps/backend/server.js):
- `/api/inbound-message` - Entry point for Telegram/Slack adapters
- `/api/context/:id/result` - Poll for async results
- `/api/agent/*` - Agent task management
- `/api/stats` - Proxy stats

## Configuration Files

- Provider configs: [`apps/backend/providers/configs/providers.json`](apps/backend/providers/configs/providers.json)
- Environment template: [`apps/backend/.env.example`](apps/backend/.env.example)
- Cursor rules: [`.cursor/rules/`](.cursor/rules/)

## Web App (apps/web/)

- Next.js 14 with App Router
- Uses Supabase, Sanity, and Three.js/React Three Fiber
- Separate from backend; deployed to Vercel
- Has own `package.json` with different dependencies
