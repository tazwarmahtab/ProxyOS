# Complete Context: ProxyOS + Openclaw Integration

**Purpose**: This document provides complete context for continuing the ProxyOS + Openclaw integration in a new conversation. Read this first before making any changes.

**Last Updated**: 2026-02-19  
**Status**: Phases 1-3 COMPLETE, Phase 4 (Openclaw bridge) optional future

---

## 1. Project Overview

### 1.1 ProxyOS - AI Office Swarm

**What it is**: A mobile-first, Apple-grade web app where users feed context to a personal "Proxy" avatar and watch a swarm of AI agents (Minion, Scout, Sage) execute work in a pixel/isometric office environment.

**Key Features**:
- **Command Center**: Text/voice input to feed context to Proxy
- **2D Pixel Office**: Phaser-based office scene with animated agents
- **Swarm Activity Drawer**: Real-time task list grouped by agent
- **Memory Vault**: Long-term agent memory browser
- **World Generator**: AI-generated offices with Three.js 3D renderer
- **Skins System**: Default + Portal-SciFi character skins

**Tech Stack**:
- **Frontend**: Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Phaser (2D), Three.js (3D), Supabase client
- **Backend**: Node 18, Express.js, Supabase, Groq (Llama 3) + Gemini
- **Database**: Supabase Postgres + Realtime
- **Hosting**: Vercel (frontend), Oracle Cloud Free Tier (backend), Supabase (database)

**Repository Structure**:
```
ProxyOS/
├── apps/
│   ├── web/              # Next.js frontend (PWA)
│   │   ├── src/
│   │   │   ├── app/       # App Router pages
│   │   │   ├── components/ # React components
│   │   │   ├── hooks/     # React hooks (useTasks, useProxyStats, useSkin)
│   │   │   └── lib/       # Utilities (supabase client, API client)
│   │   └── public/skins/  # Character skin assets
│   └── backend/           # Express.js backend (Oracle Cloud)
│       ├── server.js       # Main Express server
│       ├── Dockerfile      # Docker config
│       ├── docker-compose.yml
│       └── package.json
├── infra/
│   └── supabase-schema.sql # Complete database schema
├── docs/
│   ├── DEPLOYMENT_ORACLE.md      # Oracle Cloud deployment guide
│   ├── OPENCLAW_INTEGRATION_PLAN.md # This integration plan
│   └── CONTEXT_FOR_CONTINUATION.md # This file
├── packages/
│   └── shared/            # Shared TypeScript types (skins)
└── Openclaw/              # Openclaw submodule/copy (messaging gateway)
```

### 1.2 Openclaw - Multi-Channel AI Gateway

**What it is**: A personal AI assistant framework that connects to messaging channels (Telegram, Slack, WhatsApp, Discord, Signal, iMessage, etc.) and can send/receive messages. It has its own internal agent system, but we want to use ProxyOS as the "brain" instead.

**Key Details**:
- **Runtime**: Node ≥22 (different from ProxyOS Node 18)
- **Entry**: `openclaw.mjs` → `dist/entry.js`
- **Channels**: Telegram (Grammy), Slack (@slack/bolt), Discord, WhatsApp (Baileys), Signal, Line, Zalo, iMessage, MS Teams, Google Chat, Nostr, WebChat
- **Architecture**: Gateway HTTP server (port 18789), channel plugins/extensions, internal agent runner
- **Location**: `/Users/tazwarmahtab/ProxyOS/Openclaw/` (submodule or copy)

**Important**: We are **NOT** embedding Openclaw into ProxyOS. We will run it separately and connect via HTTP API contract.

---

## 2. Current State of ProxyOS

### 2.1 Backend (`apps/backend/server.js`)

**Current API Endpoints**:
- `GET /` - Status
- `GET /health` - Health check
- `POST /api/feed-context` - **Main entry point** (from app UI)
  - Body: `{ raw_input, input_type?, project_tag?, metadata? }`
  - Creates `proxy_context`, delegates to agents, returns `{ context_id, delegation }`
- `GET /api/swarm-status` - Returns tasks and proxy stats
- `POST /api/assign-task` - Manual task assignment
- `POST /api/halt-task/:id` - Halt a task
- `GET /api/memories/:agentRole` - Get agent memory

**Current Flow**:
1. User feeds context via `POST /api/feed-context`
2. Backend creates `proxy_context` row in Supabase
3. `analyzeAndDelegate()` analyzes input and creates `agent_tasks` for Minion/Scout/Sage
4. Cron job (`*/10 * * * * *`) processes pending tasks
5. Agents execute (call Groq/Gemini), write `output_log`, update memory
6. Frontend subscribes to Supabase Realtime on `agent_tasks` and `proxy_stats`

**Agent Roles**:
- **Minion**: Code/automation (keywords: code, deploy, github, schema, api)
- **Scout**: Research/intel (keywords: research, find, scrape, supplier, market, competitor)
- **Sage**: Strategy/QA (keywords: review, strategy, qa, polish, analyze, validate)

**Memory System**:
- On boot: `syncMemoriesOnBoot()` loads from Supabase `agent_memories` → local `agents/{role}/soul.md` and `memory.md`
- After execution: Agents append to local memory, then `persistMemory()` updates Supabase

### 2.2 Frontend (`apps/web`)

**Main Pages**:
- `app/(dashboard)/page.tsx` - Main dashboard with Office/Proxy tabs
- `app/world-generator/page.tsx` - World Generator page

**Key Components**:
- `components/office/CommandCenter.tsx` - Input with voice support, energy ring
- `components/office/SwarmDrawer.tsx` - Task list drawer
- `components/office/ProxyDashboard.tsx` - Stats display
- `components/office/MemoryVault.tsx` - Memory browser with skin selector
- `components/game/OfficeCanvas.tsx` - Phaser 2D office scene
- `components/world/IsometricOffice.tsx` - Three.js 3D office

**Hooks**:
- `hooks/useTasks.ts` - Subscribes to `agent_tasks` via Supabase Realtime
- `hooks/useProxyStats.ts` - Subscribes to `proxy_stats`
- `hooks/useSkin.ts` - Reads/writes active skin from Supabase

**API Client** (`lib/api.ts`):
- `feedContext()` - Calls `POST /api/feed-context`
- `getSwarmStatus()` - Calls `GET /api/swarm-status`
- `haltTask()` - Calls `POST /api/halt-task/:id`

### 2.3 Database Schema (`infra/supabase-schema.sql`)

**Core Tables**:
- `proxy_context` - User inputs (raw_input, input_type, project_tag, metadata, energy_gained, status)
- `agent_tasks` - Tasks for agents (context_id, agent_role, task_description, status, output_log, execution_time_ms)
- `agent_memories` - Long-term memories (agent_role, soul_markdown, memory_markdown, operational_rules)
- `execution_logs` - Audit trail
- `proxy_stats` - Energy, tasks_completed, projects_active, achievements, active_skin_id
- `generated_worlds` - World Generator concepts
- `office_instances` - Active office instances
- `agent_locks` - Distributed lane locking

**Realtime**: Enabled on `agent_tasks`, `proxy_context`, `proxy_stats`

**Seed Data**: Initial memories for `minion`, `scout`, `sage`, `proxy`; initial proxy_stats row

### 2.4 Skins System

**Location**: `packages/shared/src/skins.ts`

**Skins**:
- `default` - Clean, minimal avatars
- `portalSciFi` - Portal-sci-fi themed (legally safe, inspired by multiverse vibes)

**Structure**: Each skin defines `agents` array with `role`, `displayName`, `avatarPath`, `color`

**Storage**: Active skin stored in `proxy_stats.active_skin_id` (or `user_preferences` table if we add it)

---

## 3. Integration Goal

**Objective**: Enable users to interact with ProxyOS AI Office from **both**:
1. **ProxyOS App UI** (existing - Command Center)
2. **Messaging Apps** (Telegram, Slack, WhatsApp, Discord, etc. via Openclaw)

**Key Principle**: ProxyOS remains the **single brain**. Messaging channels are just **input/output interfaces** that forward to ProxyOS and deliver replies back.

---

## 4. Integration Architecture (Planned)

### 4.1 High-Level Flow

```
User (Telegram/Slack/etc.)
    ↓
Channel Adapter (Telegram bot / Slack app)
    ↓
POST /api/inbound-message (ProxyOS backend)
    ↓
Same delegation logic as feed-context
    ↓
Tasks created → Agents execute
    ↓
When all tasks done → Write to outbound_deliveries table
    ↓
Adapter reads outbound_deliveries (poll or Realtime)
    ↓
Send reply back to user on same channel
```

### 4.2 New Backend API Endpoints (To Be Implemented)

**POST /api/inbound-message**
- **Purpose**: Entry point for messaging channels (Telegram, Slack, etc.)
- **Body**:
  ```json
  {
    "raw_input": "string (required)",
    "channel": "telegram" | "slack" | "whatsapp" | ...,
    "channel_user_id": "string (required)",
    "reply_metadata": {
      "chat_id": "...",
      "thread_ts": "...",
      // channel-specific fields
    },
    "project_tag": "string (optional)",
    "idempotency_key": "string (optional)"
  }
  ```
- **Behavior**:
  1. Create `proxy_context` row (same as feed-context)
  2. Store `reply_address` in `metadata` or create `outbound_deliveries` row
  3. Run `analyzeAndDelegate()` (same logic as feed-context)
  4. Return `{ status: 'success', context_id }`

**GET /api/context/:id/status**
- **Purpose**: Check if context processing is complete (for polling)
- **Returns**: `{ context_id, status: 'pending'|'working'|'completed'|'error', tasks_done, tasks_total }`

**GET /api/context/:id/result**
- **Purpose**: Get aggregated result when all tasks are done
- **Returns** (when done):
  ```json
  {
    "context_id": "uuid",
    "status": "completed",
    "summary": "string",
    "outputs": [
      { "agent_role": "minion", "status": "success", "output_log": "..." }
    ],
    "aggregated_text": "Single string suitable for chat reply"
  }
  ```
- **Returns** (if not done): 202 or 404

### 4.3 New Database Table (To Be Added)

**outbound_deliveries**
```sql
create table if not exists public.outbound_deliveries (
  id uuid primary key default uuid_generate_v4(),
  context_id uuid not null references public.proxy_context(id) on delete cascade,
  channel varchar(50) not null,  -- 'telegram' | 'slack' | 'whatsapp' | 'openclaw'
  channel_user_id text not null,
  channel_extra jsonb not null default '{}',  -- e.g. chat_id, thread_ts, reply_metadata
  payload text not null default '',  -- aggregated reply text (filled when context done)
  status varchar(20) not null default 'pending',  -- pending | sent | failed
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbound_deliveries_context on public.outbound_deliveries(context_id);
create index idx_outbound_deliveries_pending on public.outbound_deliveries(status) where status = 'pending';

alter publication supabase_realtime add table public.outbound_deliveries;
```

**Purpose**: Tracks "where to send the reply" and "what to send". When all tasks for a context are done, backend sets `payload`. Adapters read pending rows and send replies.

### 4.4 Context Completion Logic (To Be Implemented)

**When**: All tasks for a `context_id` are terminal (success/failed/halted)

**What**:
1. Aggregate all `output_log` from successful tasks into a single `aggregated_text`
2. Update `outbound_deliveries` row(s) for that `context_id`: set `payload = aggregated_text`, keep `status = 'pending'`
3. Adapters (or Openclaw worker) will pick up pending rows and send

**Where**: Either in the task processor (`processTask()`) when it detects "last task for context", or a separate cron job that checks for completed contexts.

---

## 5. Implementation Phases

### Phase 1: Backend Contract + Delivery ✅ COMPLETE

**Completed Tasks**:
1. ✅ Added `outbound_deliveries` table to `infra/supabase-schema.sql`
2. ✅ Implemented `POST /api/inbound-message` in `apps/backend/server.js`
3. ✅ Implemented `GET /api/context/:id/status` in `apps/backend/server.js`
4. ✅ Implemented `GET /api/context/:id/result` in `apps/backend/server.js`
5. ✅ Implemented "context done" logic: when all tasks terminal → compute aggregated_text → update `outbound_deliveries.payload`

**Files Modified**:
- `infra/supabase-schema.sql` - Added table
- `apps/backend/server.js` - Added routes and logic

### Phase 2: Telegram Adapter ✅ COMPLETE

**Completed Tasks**:
1. ✅ Added Grammy library to `apps/backend/package.json`
2. ✅ Created `apps/backend/adapters/telegram.js`:
   - Bot initialization with token from env
   - On message received → `POST /api/inbound-message`
   - Poll `GET /api/context/:id/result` until complete
   - Send reply via Telegram API
   - Update `outbound_deliveries.status = 'sent'`
3. ✅ Added `/start` and `/help` commands

**Files Created**:
- `apps/backend/adapters/telegram.js`

**Files Modified**:
- `apps/backend/package.json` - Added grammy
- `apps/backend/.env.example` - Added `TELEGRAM_BOT_TOKEN`

### Phase 3: Slack Adapter ✅ COMPLETE

**Completed Tasks**:
1. ✅ Added `@slack/bolt` to `apps/backend/package.json`
2. ✅ Created `apps/backend/adapters/slack.js`:
   - Initialize Slack app with token/signing secret
   - On message event → `POST /api/inbound-message`
   - Same delivery flow as Telegram
   - Added `/proxyos` slash command
   - Added app_mention handler
3. ✅ Added reaction feedback while processing

**Files Created**:
- `apps/backend/adapters/slack.js`

**Files Modified**:
- `apps/backend/package.json` - Added @slack/bolt
- `apps/backend/.env.example` - Added Slack tokens

### Phase 4: Openclaw Bridge (Optional, Future)

**Tasks**:
1. Design Openclaw extension that forwards inbound messages to ProxyOS `/api/inbound-message`
2. Design delivery worker that reads `outbound_deliveries` and uses Openclaw's send APIs
3. Document how to run Openclaw + ProxyOS together

**Files to Create**:
- `Openclaw/extensions/proxyos-bridge/` (or similar)

---

## 6. Key Design Decisions

### 6.1 Why Not Embed Openclaw?

- **Different Node versions**: Openclaw requires Node ≥22, ProxyOS uses Node 18
- **Large dependency tree**: Openclaw has many dependencies we don't need
- **Complex build**: Openclaw has TypeScript build, canvas bundling, etc.
- **Separation of concerns**: ProxyOS = brain, Openclaw = messaging layer

### 6.2 Why Option A (Lightweight Adapters) First?

- **Simpler**: No need to understand Openclaw codebase deeply
- **Faster**: Can ship Telegram + Slack quickly
- **Testable**: Each adapter is small and testable independently
- **Foundation**: Same contract (`inbound-message` + `outbound_deliveries`) works for Openclaw later

### 6.3 Single Source of Truth

- **All brain logic stays in ProxyOS**: Delegation, task processing, memory, aggregation
- **Messaging layers are thin**: They only forward inbound and deliver outbound
- **No duplication**: Same `feed-context` logic used by app UI and messaging

### 6.4 Delivery Exactly-Once

- **Status tracking**: `pending` → `sent`/`failed` prevents duplicate sends
- **Idempotency**: Optional `idempotency_key` in `inbound-message` prevents duplicate contexts
- **Error handling**: Failed sends marked `failed` with `error_message`, can be retried

---

## 7. Environment Variables

### Backend (`apps/backend/.env`)

**Existing**:
- `PORT=3000` (or 7860 for HF Spaces)
- `NODE_ENV=production`
- `SUPABASE_URL=https://...`
- `SUPABASE_SERVICE_KEY=...`
- `GROQ_API_KEY=...`
- `GEMINI_API_KEY=...`

**To Add (Phase 2+)**:
- `TELEGRAM_BOT_TOKEN=...` (from @BotFather)
- `SLACK_BOT_TOKEN=xoxb-...` (from Slack app)
- `SLACK_SIGNING_SECRET=...` (from Slack app)

### Frontend (`apps/web/.env.local`)

**Existing**:
- `NEXT_PUBLIC_SUPABASE_URL=https://...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `NEXT_PUBLIC_BACKEND_URL=http://...` (Oracle Cloud IP or domain)
- `NEXT_PUBLIC_HF_TOKEN=...` (optional, for World Generator)

**No changes needed** for messaging integration.

---

## 8. Testing Strategy

### Phase 1 Testing (Backend Only)

1. **Test inbound-message**:
   ```bash
   curl -X POST http://localhost:3000/api/inbound-message \
     -H "Content-Type: application/json" \
     -d '{
       "raw_input": "Research best practices for Node.js deployment",
       "channel": "telegram",
       "channel_user_id": "test_user_123",
       "reply_metadata": { "chat_id": 123 }
     }'
   ```
   - Verify `proxy_context` created
   - Verify `agent_tasks` created (should delegate to Scout)
   - Verify `outbound_deliveries` row created with `status = 'pending'`, `payload = ''`

2. **Test status endpoint**:
   ```bash
   curl http://localhost:3000/api/context/{context_id}/status
   ```
   - Should return `{ status: 'pending'|'working'|'completed', tasks_done, tasks_total }`

3. **Test result endpoint**:
   ```bash
   curl http://localhost:3000/api/context/{context_id}/result
   ```
   - Before tasks done: 202 or 404
   - After tasks done: `{ context_id, status: 'completed', aggregated_text: '...' }`

4. **Test context completion**:
   - Wait for tasks to complete (or manually mark them done)
   - Verify `outbound_deliveries.payload` is filled
   - Verify `outbound_deliveries.status` is still `pending` (adapter will mark `sent`)

### Phase 2 Testing (Telegram)

1. Create Telegram bot via @BotFather
2. Set `TELEGRAM_BOT_TOKEN` in backend `.env`
3. Start backend (with Telegram adapter)
4. Send message to bot
5. Verify:
   - Message received by adapter
   - `POST /api/inbound-message` called
   - Tasks created
   - Reply sent back to Telegram
   - `outbound_deliveries.status` updated to `sent`

---

## 9. File Reference

### Critical Files (Read Before Modifying)

**Backend**:
- `apps/backend/server.js` - Main Express server, task processing, agent logic
- `apps/backend/package.json` - Dependencies

**Database**:
- `infra/supabase-schema.sql` - Complete schema (add `outbound_deliveries` here)

**Frontend** (no changes needed, but for reference):
- `apps/web/src/lib/api.ts` - API client (shows how to call backend)
- `apps/web/src/hooks/useTasks.ts` - Shows Supabase Realtime subscription pattern

**Documentation**:
- `docs/OPENCLAW_INTEGRATION_PLAN.md` - Full integration plan
- `docs/DEPLOYMENT_ORACLE.md` - Deployment guide

### Key Functions to Understand

**In `server.js`**:
- `analyzeAndDelegate(raw_input, contextId, projectTag)` - Delegation logic (lines ~350-450)
- `processTask(taskId)` - Task execution (lines ~200-300)
- `processQueue()` - Cron job that processes pending tasks (lines ~300-350)
- `feedContext()` route - Current entry point (lines ~370-400)

**Pattern to Follow**:
- Look at `POST /api/feed-context` as template for `POST /api/inbound-message`
- Look at `processTask()` to understand when to mark context as "done"
- Look at Supabase queries to understand how to check "all tasks done"

---

## 10. Common Patterns

### Supabase Query Pattern

```javascript
// Get all tasks for a context
const { data: tasks } = await supabase
  .from('agent_tasks')
  .select('*')
  .eq('context_id', contextId);

// Check if all tasks are terminal
const allDone = tasks.every(t => 
  ['success', 'failed', 'halted'].includes(t.status)
);

// Aggregate outputs
const aggregatedText = tasks
  .filter(t => t.status === 'success' && t.output_log)
  .map(t => `[${t.agent_role}]: ${t.output_log}`)
  .join('\n\n');
```

### Realtime Subscription Pattern (for adapters)

```javascript
const channel = supabase
  .channel('deliveries')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'outbound_deliveries',
      filter: `context_id=eq.${contextId}`,
    },
    (payload) => {
      if (payload.new.payload && payload.new.status === 'pending') {
        // Send reply
        sendReply(payload.new);
      }
    }
  )
  .subscribe();
```

---

## 11. Next Steps (When Continuing)

### ✅ Phases 1-3 Are Complete

The implementation is done! To deploy:

1. **Run the SQL migration** in Supabase SQL Editor:
   ```sql
   -- Copy the outbound_deliveries table from infra/supabase-schema.sql
   ```

2. **Configure environment variables** in `.env`:
   - `TELEGRAM_BOT_TOKEN` (for Telegram)
   - `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` (for Slack)

3. **Start the services**:
   ```bash
   npm start              # Backend
   npm run start:telegram # Telegram adapter
   npm run start:slack    # Slack adapter
   ```

### Future: Phase 4 (Openclaw Bridge)

1. Design Openclaw extension that forwards to ProxyOS
2. Create delivery worker for Openclaw channels
3. Document how to run Openclaw + ProxyOS together

### Important Notes

- **Don't break existing functionality**: App UI must continue working unchanged
- **Follow existing patterns**: Look at `feed-context` route as template
- **Test incrementally**: Test each endpoint before moving to next
- **Use Supabase Realtime**: Adapters can subscribe instead of polling (more efficient)

---

## 12. Questions to Answer (If Stuck)

1. **How do I know when all tasks for a context are done?**
   - Query `agent_tasks` where `context_id = X`
   - Check if all have `status IN ('success', 'failed', 'halted')`

2. **How do I aggregate outputs?**
   - Collect all `output_log` from successful tasks
   - Join with agent role names: `[Minion]: ...`, `[Scout]: ...`, etc.

3. **Where should adapters run?**
   - Option A: Same process as Express server (simpler)
   - Option B: Separate process/service (more scalable)

4. **How do I handle errors?**
   - Mark `outbound_deliveries.status = 'failed'`, set `error_message`
   - Optional: Retry cron job for failed deliveries

5. **What if user sends multiple messages quickly?**
   - Each message creates separate `context_id` and `outbound_deliveries` row
   - Replies are independent (no threading unless channel supports it)

---

## 13. Success Criteria

**Phase 1 Complete** ✅:
- ✅ `outbound_deliveries` table exists in Supabase
- ✅ `POST /api/inbound-message` creates context and delivery row
- ✅ `GET /api/context/:id/status` returns correct status
- ✅ `GET /api/context/:id/result` returns aggregated text when done
- ✅ Context completion logic fills `outbound_deliveries.payload`

**Phase 2 Complete** ✅:
- ✅ Telegram bot receives message
- ✅ Message forwarded to ProxyOS
- ✅ Reply sent back to Telegram
- ✅ End-to-end flow works

**Phase 3 Complete** ✅:
- ✅ Slack bot receives messages and mentions
- ✅ `/proxyos` slash command works
- ✅ Reply sent back to Slack
- ✅ End-to-end flow works

**Full Integration Complete When Deployed**:
- ✅ Users can interact via App UI (existing)
- ✅ Users can interact via Telegram (new - ready to deploy)
- ✅ Users can interact via Slack (new - ready to deploy)
- ✅ Same context appears in App UI when viewing by context_id
- ✅ No duplicate replies (idempotency key support)
- ✅ Failed sends are tracked and retryable

---

## 14. Resources

**ProxyOS Documentation**:
- `docs/DEPLOYMENT_ORACLE.md` - How to deploy backend
- `docs/OPENCLAW_INTEGRATION_PLAN.md` - Full integration plan
- `README.md` - Project overview

**Openclaw Documentation**:
- `Openclaw/README.md` - Openclaw overview
- Openclaw docs: https://docs.openclaw.ai

**Key Libraries**:
- Telegram: `node-telegram-bot-api` or `grammy` (Openclaw uses Grammy)
- Slack: `@slack/bolt`
- Supabase: `@supabase/supabase-js` (already in use)

---

## 15. Important Reminders

1. **Don't modify Openclaw source** - We'll use it as-is and connect via API
2. **Keep ProxyOS as single brain** - All delegation logic stays in ProxyOS
3. **Test incrementally** - Each phase should be testable independently
4. **Document as you go** - Update this context doc if architecture changes
5. **Follow existing patterns** - Look at `feed-context` route as template
6. **Use environment variables** - Never hardcode tokens/secrets
7. **Handle errors gracefully** - Failed sends should be tracked, not lost

---

**End of Context Document**

This document should be sufficient to continue the integration in a new conversation. Read `docs/OPENCLAW_INTEGRATION_PLAN.md` for the detailed plan, then start with Phase 1 implementation.
