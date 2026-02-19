# Openclaw + ProxyOS: End-to-End Integration Plan

**Status**: Planning (pre-implementation)  
**Goal**: Let users interact with the ProxyOS AI Office (Minion/Scout/Sage) from **both** the ProxyOS app UI **and** messaging apps (Telegram, Slack, WhatsApp, etc.) by integrating Openclaw as the messaging layer and ProxyOS as the brain.

---

## 1. Executive Summary

- **ProxyOS** = brain: receives context, delegates to agents (Minion, Scout, Sage), stores tasks and memories in Supabase.
- **Openclaw** = multi-channel gateway: connects to Telegram, Slack, Discord, WhatsApp, Signal, iMessage, etc., receives messages and can send replies.
- **Integration**: Messages from any Openclaw-connected channel are forwarded to ProxyOS; ProxyOS runs the same delegation pipeline; results are sent back through Openclaw (or through a lightweight delivery path) to the user on that channel.

We will **not** embed the full Openclaw codebase into ProxyOS (different Node version, large dependency tree, complex build). We will **run Openclaw as a separate process** and connect it to ProxyOS via a small **bridge** and clear contracts.

---

## 2. Current State (What We Have)

### 2.1 ProxyOS Backend (`apps/backend`)

- **Stack**: Node 18, Express, Supabase, Groq + Gemini.
- **Entry point**: `POST /api/feed-context` — accepts `raw_input`, stores in `proxy_context`, delegates to `agent_tasks`, returns `context_id` and delegation list.
- **Processing**: Cron every 10s processes pending tasks; agents (Minion, Scout, Sage) run and write `output_log` and update memory.
- **No notion of**: “who asked” or “where to send the reply” (UI only).

### 2.2 ProxyOS Frontend (`apps/web`)

- Command Center: user types/voices → calls `POST /api/feed-context` → Realtime shows tasks in Swarm Drawer and office.
- No messaging-app integration today.

### 2.3 Openclaw (`Openclaw/`)

- **Description**: “Multi-channel AI gateway with extensible messaging integrations.”
- **Runtime**: Node ≥22, pnpm, TypeScript, build to `dist/`.
- **Entry**: `openclaw.mjs` → `dist/entry.js`; gateway runs as HTTP server (e.g. port 18789).
- **Channels**: Telegram (Grammy), Slack (@slack/bolt), Discord, WhatsApp (Baileys), Signal, Line, Zalo, iMessage (BlueBubbles), MS Teams, Google Chat, Nostr, WebChat, etc., via extensions.
- **Flow**: Inbound message → routing/pairing → **internal agent** (runReplyAgent) → reply delivered back on same channel via channel-specific send (e.g. `sendMessageTelegram`, Slack API).
- **Hooks**: Openclaw exposes **incoming** HTTP hooks (`/hooks/wake`, `/hooks/agent`) so **external systems can send messages into** Openclaw. We need the **reverse**: Openclaw receives from user → we want that to go to ProxyOS, then reply back via Openclaw.

So we need a **bridge** that:

1. Receives “user said X on channel C” from Openclaw (or from standalone bots).
2. Sends X to ProxyOS as context and gets back a `context_id`.
3. Waits for ProxyOS to finish processing (poll or Realtime).
4. Sends the aggregated reply back to the user on channel C (via Openclaw’s send APIs or a small delivery service).

---

## 3. Architecture Options

### Option A (Recommended): ProxyOS-Centric + Lightweight Channel Adapters

- **Idea**: Keep ProxyOS as the single “brain.” Add **lightweight channel adapters** (e.g. Telegram bot, Slack app) that:
  - Receive messages from Telegram/Slack.
  - POST to ProxyOS `POST /api/inbound-message` (new) with `raw_input` + `channel` + `channel_user_id` + `reply_metadata`.
  - Either **poll** `GET /api/context/:id/result` or **subscribe** (Supabase Realtime or webhook) for completion.
  - On completion, send the reply back using the **same adapter** (Telegram API, Slack API) — no Openclaw required for v1.
- **Pros**: Simple, no Openclaw dependency, same codebase (ProxyOS backend can host the bot logic or a small sibling service). Easy to reason about for someone new to coding.
- **Cons**: We only support the channels we implement (e.g. Telegram + Slack first). Adding more channels means more adapters.

### Option B: Openclaw as Messaging Layer + ProxyOS as Brain

- **Idea**: Run Openclaw gateway; add an **Openclaw extension/skill** that:
  - On inbound message (any channel): POST to ProxyOS `/api/inbound-message`, get `context_id`.
  - Poll or subscribe for result; when ready, call Openclaw’s **outbound send** (e.g. Telegram send, Slack send) to deliver the reply.
- **Pros**: One place (Openclaw) for all channels (Telegram, Slack, WhatsApp, Discord, etc.); pairing, security, and channel logic stay in Openclaw.
- **Cons**: Requires building and maintaining an Openclaw extension and possibly a small “delivery callback” or shared table so Openclaw knows what to send and where.

### Option C: Hybrid (Recommended Long-Term)

- **Phase 1**: Implement **Option A** — Telegram + Slack (and optionally one more) as standalone adapters in ProxyOS; `POST /api/inbound-message` + delivery table + result aggregation.
- **Phase 2**: Add **Openclaw bridge** — optional extension or sidecar that forwards Openclaw inbound messages to ProxyOS and uses a **delivery contract** (e.g. Supabase `outbound_deliveries` table or webhook) so Openclaw (or a small worker) can send replies for all other channels without duplicating channel code.

We will **plan and implement Option A first**, then design the Openclaw bridge (Option B/C) so that the same ProxyOS API and delivery table are used.

---

## 4. Target Architecture (Option A + Future Openclaw Bridge)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER TOUCHPOINTS                                   │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────┤
│  ProxyOS App    │  Telegram        │  Slack          │  (Future: Openclaw  │
│  (Command       │  Bot             │  App            │   → all channels)    │
│   Center)       │                  │                 │                     │
└────────┬────────┴────────┬─────────┴────────┬────────┴──────────┬──────────┘
         │                 │                  │                   │
         │ POST             │ POST             │ POST               │ POST
         │ /api/feed-context│ /api/inbound-msg │ /api/inbound-msg   │ /api/inbound-msg
         │                  │                  │                   │ (from Openclaw
         ▼                  ▼                  ▼                   │  extension)
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PROXYOS BACKEND (Oracle Cloud)                           │
│  • POST /api/feed-context         (existing)                                │
│  • POST /api/inbound-message      (new)                                     │
│  • GET  /api/context/:id/status   (new)                                     │
│  • GET  /api/context/:id/result   (new)                                      │
│  • Task queue → Minion / Scout / Sage                                       │
│  • On context “done” → write to outbound_deliveries (new table)              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ Realtime / poll
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                                   │
│  • proxy_context (existing)                                                  │
│  • agent_tasks (existing)                                                    │
│  • outbound_deliveries (new) — context_id, channel, target_id, payload,     │
│    status, sent_at                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ Adapters read outbound_deliveries (or webhook) and send
         ▼
┌─────────────────┬─────────────────┬─────────────────────────────────────────┐
│  Telegram       │  Slack          │  Openclaw (future): reads deliveries     │
│  Adapter        │  Adapter        │  and uses its send APIs                  │
│  (in backend    │  (in backend    │  for Telegram/Slack/WhatsApp/etc.        │
│   or same box)  │   or same box)  │                                         │
└─────────────────┴─────────────────┴─────────────────────────────────────────┘
```

- **App UI**: unchanged; continues to use `POST /api/feed-context` and Realtime.
- **Messaging**: All messaging paths (Telegram, Slack, future Openclaw) use the same **inbound** and **outbound** contract so we don’t duplicate brain logic.

---

## 5. Data Model Additions

### 5.1 New Table: `outbound_deliveries`

Used to “send reply back” to a user on a channel. Written by ProxyOS when a context is done; read by channel adapters (or Openclaw bridge) to perform the send.

```sql
create table if not exists public.outbound_deliveries (
  id uuid primary key default uuid_generate_v4(),
  context_id uuid not null references public.proxy_context(id) on delete cascade,
  channel varchar(50) not null,  -- 'telegram' | 'slack' | 'whatsapp' | 'openclaw'
  channel_user_id text not null,
  channel_extra jsonb not null default '{}',  -- e.g. chat_id, thread_ts, reply_metadata
  payload text not null,         -- aggregated reply text (or JSON for rich)
  status varchar(20) not null default 'pending',  -- pending | sent | failed
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbound_deliveries_context on public.outbound_deliveries(context_id);
create index idx_outbound_deliveries_status on public.outbound_deliveries(status) where status = 'pending';
```

- **context_id**: Links to the `proxy_context` that triggered this delivery.
- **channel** / **channel_user_id** / **channel_extra**: Where to send (e.g. Telegram `chat_id`, Slack `channel` + `thread_ts`).
- **payload**: Aggregated agent output (e.g. plain text or markdown).
- **status**: So adapters can process only `pending` and mark `sent` or `failed`.

### 5.2 Extend `proxy_context.metadata` (Optional)

- Store `reply_address` in `metadata` when the request came from a messaging channel, e.g.:
  - `metadata.reply_address = { channel: 'telegram', channel_user_id: '123', channel_extra: { chat_id: 123 } }`
- This allows a single place to know “where to reply” when we aggregate results.

Alternatively we can rely only on `outbound_deliveries` and not duplicate in `metadata`; recommended is to **only** use `outbound_deliveries` for delivery state.

---

## 6. API Contract (ProxyOS Backend)

### 6.1 Existing (unchanged)

- `POST /api/feed-context` — body: `{ raw_input, input_type?, project_tag?, metadata? }` → `{ status, context_id, delegation }`.
- `GET /api/swarm-status` — returns recent tasks and proxy stats.
- `GET /health` — health check.

### 6.2 New: Inbound from messaging channels

**POST /api/inbound-message**

- **Request body**:
  - `raw_input` (string, required): User’s message text.
  - `channel` (string, required): e.g. `telegram`, `slack`, `whatsapp`.
  - `channel_user_id` (string, required): Stable id of the user on that channel (e.g. Telegram user id, Slack user id).
  - `reply_metadata` (object, optional): Everything the adapter needs to send the reply later (e.g. `chat_id`, `thread_ts`, `channel_id`).
  - `project_tag` (string, optional): Same as feed-context.
- **Behavior**:
  - Insert `proxy_context` with `raw_input` and `metadata.reply_address = { channel, channel_user_id, reply_metadata }`.
  - Run same delegation logic as `feed-context` (analyzeAndDelegate).
  - Insert one row into `outbound_deliveries` with `context_id`, `channel`, `channel_user_id`, `channel_extra = reply_metadata`, `payload = ''`, `status = 'pending'`. (Payload will be filled when context is “done.”)
  - Return `{ status: 'success', context_id }` (and optionally delegation).
- **Idempotency**: Optional `idempotency_key` in body to avoid duplicate contexts for the same message (e.g. from retries).

### 6.3 New: Status and result (for polling)

**GET /api/context/:id/status**

- Returns `{ context_id, status: 'pending'|'working'|'completed'|'error', tasks_done, tasks_total }` so clients can poll.

**GET /api/context/:id/result**

- When all tasks for this context are terminal (success/failed/halted): returns aggregated result, e.g.:
  - `{ context_id, status: 'completed', summary, outputs: [ { agent_role, status, output_log } ], aggregated_text }`
- If not yet done: 202 or 404 as appropriate.
- **aggregated_text**: Single string (e.g. concatenation of `output_log` or a short summary) suitable for sending as a reply in a chat.

### 6.4 Backend logic: “Context done” → fill delivery

- When the **task processor** marks the last task for a given `context_id` as terminal, it:
  - Computes `aggregated_text` (and optionally `summary`).
  - Updates `outbound_deliveries` for that `context_id`: set `payload = aggregated_text`, keep `status = 'pending'` so adapters can pick it up.
- Alternatively a **small cron** (e.g. every 30s) can: find `proxy_context` rows that have `outbound_deliveries` with `status = 'pending'` and all linked tasks terminal → compute aggregated result → update `outbound_deliveries.payload`.  
- Adapters then either **poll** `GET /api/context/:id/result` or **subscribe to Supabase Realtime** on `outbound_deliveries` (filter `status = 'pending'` and then fetch payload / send).

---

## 7. Channel Adapters (Option A)

### 7.1 Telegram

- **In**: Bot token in env; webhook or long polling to receive `message.text`.
- **Flow**: On message → `POST /api/inbound-message` with `channel: 'telegram'`, `channel_user_id: from.id`, `reply_metadata: { chat_id }`.
- **Out**: Either poll `GET /api/context/:id/result` in a loop (with backoff) or subscribe to Realtime for `outbound_deliveries` where `context_id = X`; when payload is non-empty, call Telegram Bot API `sendMessage(chat_id, payload)` and set delivery `status = 'sent'`.
- **Where it runs**: Same Node process as ProxyOS (e.g. same `server.js` using `node-telegram-bot-api` or Grammy) or a small separate “ProxyOS-adapters” service that shares the same env (ProxyOS URL, Supabase).

### 7.2 Slack

- **In**: Slack App with Bot Token; events API or slash command; on event → `POST /api/inbound-message` with `channel: 'slack'`, `channel_user_id: user_id`, `reply_metadata: { channel_id, thread_ts? }`.
- **Out**: Same pattern — poll or Realtime; when payload is ready, `chat.postMessage` (and optionally `thread_ts`) and mark delivery `sent`.
- **Where**: Same as Telegram (backend or adapters service).

### 7.3 Optional: Openclaw bridge (Option B/C)

- **In**: Openclaw extension (or a webhook receiver) that, when Openclaw receives a message on any channel, does:
  - `POST /api/inbound-message` with `channel: 'openclaw'` (or the concrete channel name), `channel_user_id`, `reply_metadata` containing whatever Openclaw needs to send later (e.g. session key, channel type, target id).
- **Out**: A worker (inside Openclaw or separate) that:
  - Subscribes to `outbound_deliveries` (Realtime or poll) where `channel = 'openclaw'` (or per-channel);
  - For each pending row, calls Openclaw’s internal send (e.g. Telegram send, Slack send) using `channel_extra`; then marks `sent`.
- Openclaw’s send APIs are internal; we’d need either an HTTP “send” endpoint exposed by Openclaw or the worker to run inside Openclaw’s process and call its modules. This is Phase 2.

---

## 8. End-to-End Flows

### 8.1 App UI (unchanged)

1. User types in Command Center → `POST /api/feed-context`.
2. Frontend gets `context_id`; Realtime shows new tasks and updates.
3. No `outbound_deliveries` row (no `reply_address`); UI already shows results via Realtime on `agent_tasks`.

### 8.2 Telegram (new)

1. User sends a message to the bot.
2. Telegram adapter receives update → `POST /api/inbound-message` with `raw_input`, `channel: 'telegram'`, `channel_user_id`, `reply_metadata: { chat_id }`.
3. Backend creates `proxy_context` and `outbound_deliveries` (pending), delegates tasks.
4. Adapter either:
   - **Poll**: Every few seconds `GET /api/context/:id/result` until `status === 'completed'`, then send `aggregated_text` to `chat_id` and update delivery to `sent`; or
   - **Realtime**: Subscribe to `outbound_deliveries` for this `context_id`; when `payload` is set, send and mark `sent`.
5. Backend (or cron) when all tasks for that context are done: sets `outbound_deliveries.payload = aggregated_text`.

### 8.3 Slack (new)

- Same as Telegram, with `channel: 'slack'` and `reply_metadata: { channel_id, thread_ts }`; reply via `chat.postMessage`.

### 8.4 Openclaw (future)

- Inbound: Openclaw extension → `POST /api/inbound-message` with Openclaw-specific `reply_metadata`.
- Outbound: Worker reads `outbound_deliveries`, uses Openclaw’s send layer to deliver, marks `sent`.

---

## 9. Functionality Checklist (Complete)

- [ ] **Backend**
  - [ ] Add `outbound_deliveries` table and migration.
  - [ ] Implement `POST /api/inbound-message` (create context + delegation + one pending delivery row).
  - [ ] Implement `GET /api/context/:id/status`.
  - [ ] Implement `GET /api/context/:id/result` (aggregated_text when all tasks terminal).
  - [ ] On “context done”: update `outbound_deliveries.payload` (in task processor or cron).
  - [ ] Optional: idempotency key for inbound-message.
- [ ] **Telegram adapter**
  - [ ] Receive updates (webhook or long poll).
  - [ ] Call `POST /api/inbound-message` with telegram reply_metadata.
  - [ ] Poll or Realtime for result; send reply via Telegram API; set delivery `sent`.
- [ ] **Slack adapter**
  - [ ] Receive events (or slash command).
  - [ ] Call `POST /api/inbound-message` with slack reply_metadata.
  - [ ] Poll or Realtime; send reply via Slack API; set delivery `sent`.
- [ ] **App UI**
  - [ ] No change required; optional: show “also available on Telegram / Slack” in UI.
- [ ] **Openclaw bridge (Phase 2)**
  - [ ] Design Openclaw extension that forwards inbound to ProxyOS.
  - [ ] Design delivery path (table or webhook) and worker that uses Openclaw send.
  - [ ] Document how to run Openclaw + ProxyOS together (same machine or same Docker Compose).

---

## 10. Implementation Phases

### Phase 1: Backend contract and delivery (no new channels)

1. Add `outbound_deliveries` to Supabase schema.
2. Implement `POST /api/inbound-message`, `GET /api/context/:id/status`, `GET /api/context/:id/result`.
3. Implement “context done” logic: when all tasks for a context are terminal, compute aggregated text and update `outbound_deliveries.payload` for that context_id.
4. Test with curl/Postman: create context via inbound-message, run tasks, then get result and verify delivery row.

### Phase 2: Telegram adapter

1. Add Telegram bot (e.g. in `apps/backend` or `apps/adapters`) with token from env.
2. On message → POST to local ProxyOS `POST /api/inbound-message`.
3. Poll or Realtime for result; send reply; update delivery status.
4. Deploy with backend (or as same Docker image with a second entrypoint).

### Phase 3: Slack adapter

1. Add Slack app (events or slash); on message → POST to `POST /api/inbound-message`.
2. Same delivery flow as Telegram.
3. Deploy.

### Phase 4 (optional): Openclaw bridge

1. Document `outbound_deliveries` and `/api/inbound-message` contract for Openclaw.
2. Implement Openclaw extension (or standalone webhook receiver) that forwards to ProxyOS.
3. Implement delivery worker (reads `outbound_deliveries`, calls Openclaw send APIs) and run it alongside Openclaw.

---

## 11. Risk Mitigation (Overwatcher Notes)

- **Single source of truth**: All “brain” logic stays in ProxyOS (delegation, tasks, memory). Messaging layers only “inbound → ProxyOS” and “outbound_deliveries → send.”
- **No forking Openclaw**: We don’t embed or fork Openclaw; we run it as-is and optionally add an extension or a small bridge that uses our HTTP contract.
- **Delivery exactly-once**: Use `status = 'pending'` → process → `sent`/`failed` and optional idempotency keys to avoid duplicate sends or duplicate contexts.
- **Secrets**: Telegram token, Slack signing secret/token, ProxyOS URL — all from env; never in repo.
- **Rate limits**: Respect Telegram/Slack rate limits when sending replies; optional queue in front of “send” if needed.
- **Errors**: On send failure, set `status = 'failed'`, `error_message`; optional retry cron for failed deliveries.
- **New to coding**: Phase 1 is backend-only and testable with curl; Phase 2 adds one channel (Telegram) with a small, well-scoped adapter so you can test end-to-end without opening the full Openclaw codebase.

---

## 12. File / Repo Layout (Proposed)

- **Backend** (existing + new):
  - `apps/backend/server.js` — add routes: `POST /api/inbound-message`, `GET /api/context/:id/status`, `GET /api/context/:id/result`; add “context done” → update `outbound_deliveries.payload`.
  - `apps/backend/adapters/telegram.js` (optional) — start Telegram bot; on message → inbound-message; poll/Realtime → send.
  - `apps/backend/adapters/slack.js` (optional) — same for Slack.
- **Infra**:
  - `infra/supabase-schema.sql` — add `outbound_deliveries`; optional migration file.
- **Openclaw** (later):
  - Keep `Openclaw/` as submodule or copy; add `Openclaw/extensions/proxyos-bridge/` (or similar) that forwards to ProxyOS and implements delivery from `outbound_deliveries`.

---

## 13. Success Criteria

- User can send a message to a Telegram bot and receive a single aggregated reply from ProxyOS (Minion/Scout/Sage) on Telegram.
- User can send a message in Slack (DM or channel) and receive the same kind of reply in Slack.
- Same context appears in ProxyOS app (Swarm / tasks) when viewing by context_id.
- No duplicate replies; failed sends are marked and optionally retried.
- Documentation is enough for a maintainer (or you) to add another channel (e.g. Discord) by implementing the same inbound-message + outbound_deliveries contract.

---

This plan is the complete end-to-end integration and functionality baseline. Once you approve it, we can move to implementation starting with Phase 1 (backend contract + delivery table + aggregation), then Phase 2 (Telegram), then Phase 3 (Slack), and optionally Phase 4 (Openclaw bridge).

---

## Appendix A: Schema snippet for `outbound_deliveries`

Add to `infra/supabase-schema.sql` (or run as a one-off migration):

```sql
create table if not exists public.outbound_deliveries (
  id uuid primary key default uuid_generate_v4(),
  context_id uuid not null references public.proxy_context(id) on delete cascade,
  channel varchar(50) not null,
  channel_user_id text not null,
  channel_extra jsonb not null default '{}',
  payload text not null default '',
  status varchar(20) not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbound_deliveries_context on public.outbound_deliveries(context_id);
create index idx_outbound_deliveries_pending on public.outbound_deliveries(status) where status = 'pending';

alter publication supabase_realtime add table public.outbound_deliveries;
```

---

## Appendix B: Quick reference

| Component | Responsibility |
|-----------|----------------|
| **ProxyOS backend** | Single brain: feed-context + inbound-message → delegate → tasks → aggregate → write outbound_deliveries.payload |
| **App UI** | Uses feed-context + Realtime only; no change for messaging. |
| **Telegram/Slack adapters** | Receive message → POST inbound-message → wait for result (poll/Realtime) → send reply → mark delivery sent. |
| **Openclaw (future)** | Extension forwards inbound to ProxyOS; worker reads outbound_deliveries and uses Openclaw send. |
| **Supabase** | proxy_context, agent_tasks, outbound_deliveries; Realtime for adapters (optional). |
