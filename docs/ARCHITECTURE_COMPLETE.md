# ProxyOS Complete System Architecture

**Status**: Phase 4A (OpenClaw Bridge) Completed  
**Last Updated**: 2026-02-20  
**Version**: 1.1

---

## 1. System Overview

ProxyOS is a gamified AI workspace that delegates user requests to three specialized agents (Minion, Scout, Sage) and delivers results across multiple channels. This document details the complete system architecture integrating all components with free hosting.

### 1.1 High-Level Architecture

```mermaid
flowchart TB
    subgraph User_Channels["User Touchpoints"]
        WEB[("Web App<br/>(Vercel)")]
        TG[("Telegram<br/>Bot")]
        SL[("Slack<br/>App")]
        OC[("OpenClaw<br/>(Future Channels)")]
    end

    subgraph Cloud_Services["Cloud Services"]
        HF["HuggingFace<br/>Spaces"]
        SUP["Supabase<br/>(Database + Realtime)"]
        UP["Upstash<br/>(Redis)"]
    end

    subgraph Backend_Services["Backend Services"]
        API["ProxyOS Backend<br/>(Express on HF)"]
        PM["Persistent Memory<br/>(Redis Layer)"]
        LLM["LLM Provider<br/>Chain"]
        BR["OpenClaw<br/>Bridge"]
    end

    subgraph LLM_Providers["LLM Providers (Free Tier)"]
        NV["NVIDIA NIM"]
        GR["Groq"]
        ZA["Z.ai"]
        OC2["OpenCode"]
        OR["OpenRouter"]
        CL["Claude<br/>(New)"]
    end

    subgraph Agents["Agent System"]
        MN["Minion<br/>(Technical)"]
        SC["Scout<br/>(Research)"]
        SA["Sage<br/>(Strategy)"]
    end

    subgraph External["External Services"]
        FLY["Fly.io<br/>(OpenClaw)"]
    end

    WEB -->|HTTP| API
    TG -->|HTTP POST| API
    SL -->|HTTP POST| API
    
    API -->|Read/Write| SUP
    API -->|Context Storage| PM
    PM -->|Cache| UP
    API -->|Delegate| LLM
    API -->|Store Results| SUP
    
    LLM --> NV
    LLM --> GR
    LLM --> ZA
    LLM --> OC2
    LLM --> OR
    LLM --> CL
    
    LLM -->|Results| MN
    LLM -->|Results| SC
    LLM -->|Results| SA
    
    MN -->|Tasks| SUP
    SC -->|Tasks| SUP
    SA -->|Tasks| SUP
    
    BR -->|Bridge| FLY
    BR -->|Forward| API
    FLY --> OC
    
    API -->|Outbound| TG
    API -->|Outbound| SL
    API -->|Outbound| OC
```

### 1.2 Data Flow Architecture

```mermaid
sequenceDiagram
    participant User
    participant Adapter as Channel Adapter
    participant API as ProxyOS Backend
    participant Redis as Upstash Redis
    participant DB as Supabase
    participant LLM as LLM Chain
    participant Agent as Minion/Scout/Sage

    User->>Adapter: Send message
    Adapter->>API: POST /api/inbound-message
    API->>Redis: Store context session
    API->>DB: Insert proxy_context
    API->>DB: Insert agent_tasks
    API->>DB: Insert outbound_deliveries (pending)
    API-->>Adapter: Return context_id
    
    loop Task Processing
        Agent->>DB: Poll pending tasks
        Agent->>LLM: Get AI response
        Agent->>DB: Update task (success/failed)
    end
    
    API->>DB: Aggregate results
    API->>DB: Update outbound_deliveries.payload
    API-->>Adapter: Result ready (via polling/Realtime)
    
    Adapter->>User: Send reply via channel
    Adapter->>DB: Mark delivery sent
```

---

## 2. Component Specifications

### 2.1 ProxyOS Backend

**Location**: [`apps/backend/server.js`](apps/backend/server.js)

**Current State**:
- Express.js server running on port 7860 (default)
- Stateless provider failover chain: nvidia → groq → zai → opencode → openrouter → OpenClaw cloud
- In-memory context storage (`Map()`) - requires Redis for production
- Supabase for persistent storage

**Existing Endpoints**:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/feed-context` | POST | Web app context input |
| `/api/inbound-message` | POST | Messaging adapter input |
| `/api/context/:id/status` | GET | Poll task status |
| `/api/context/:id/result` | GET | Get aggregated results |
| `/api/swarm-status` | GET | Get recent tasks |
| `/health` | GET | Health check |

**Required Enhancements**:
1. Redis integration for persistent context
2. Claude provider integration
3. OpenClaw bridge endpoint
4. Context expiration/TTL management

### 2.2 OpenClaw Bridge (Phase 4 - New)

**Purpose**: Connect standalone OpenClaw instance to ProxyOS brain

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Bridge                          │
├─────────────────────────────────────────────────────────────┤
│  1. Inbound Handler: Receives messages from OpenClaw        │
│     → POST /api/inbound-message (channel: 'openclaw')       │
│                                                             │
│  2. Delivery Worker: Reads outbound_deliveries table        │
│     → Calls OpenClaw send APIs                              │
│     → Marks delivery sent/failed                           │
│                                                             │
│  3. Session Manager: Maintains OpenClaw session context     │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points**:
- Reads from `outbound_deliveries` table (channel = 'openclaw')
- Uses OpenClaw's internal send functions or HTTP hooks
- Requires OpenClaw Gateway Token for authentication

### 2.3 Persistent Memory Layer (Upstash Redis)

**Purpose**: Replace in-memory Map() with persistent Redis storage

**Data Structures**:

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `context:{userId}:messages` | List | Message history |
| `context:{userId}:provider` | String | Current LLM provider |
| `context:{userId}:metadata` | Hash | Session metadata |
| `locks:{agentRole}` | String | Distributed lock |

**Features**:
- TTL-based expiration (90 days default)
- Session continuity across restarts
- Distributed locking for multi-instance deployments

**Configuration**:
```
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 2.4 LLM Provider Chain

**Current Provider Order** (with circuit breaker):
1. **NVIDIA** (priority 1) - nemotron-70b, nemotron-340b
2. **Groq** (priority 2) - llama-3.3-70b, mixtral-8x7b
3. **Z.ai** (priority 3) - GLM-4.7-Flash (free)
4. **OpenCode** (priority 4) - opencode/default
5. **OpenRouter** (priority 5) - claude-3-opus, gpt-4o
6. **OpenClaw Cloud** (fallback) - remote API

**New Provider to Add**:
- **Claude** via Anthropic API (priority 2 or 3)
- Uses Claude 3.5 Sonnet for balanced quality/speed
- Requires ANTHROPIC_API_KEY

**Provider Configuration**: [`apps/backend/providers/configs/providers.json`](apps/backend/providers/configs/providers.json)

### 2.5 Adapters

#### 2.5.1 Telegram Adapter

**Location**: [`adapters/telegram.js`](adapters/telegram.js)

**Features**:
- Grammy bot framework
- Polls `/api/context/:id/result` for completion
- Sends replies via Telegram Bot API
- Supports threads/replies
- Rate limiting (20 msg/min default)

#### 2.5.2 Slack Adapter

**Location**: [`adapters/slack.js`](adapters/slack.js)

**Features**:
- @slack/bolt framework
- Supports: messages, app_mention, /proxyos slash command
- Thread-aware replies
- Reaction emojis for status

#### 2.5.3 OpenClaw (Future)

**Location**: [`Openclaw/`](Openclaw/)

**Deployment**: Fly.io (moltbot-damp-fog-7456)

**Channels Supported**: Telegram, Slack, Discord, WhatsApp, Signal, Line, iMessage, Teams, etc.

---

## 3. Integration Points

### 3.1 OpenClaw ↔ ProxyOS Bridge API

```mermaid
flowchart LR
    subgraph OpenClaw["OpenClaw (Fly.io)"]
        OC_GW[Gateway]
        OC_EXT[Extension<br/>proxyos-bridge]
    end
    
    subgraph ProxyOS["ProxyOS Backend (HF)"]
        API_IN[/api/inbound-message]
        API_OUT[/api/context/:id/result]
        DB[(Supabase)]
    end
    
    OC_GW -->|Message| OC_EXT
    OC_EXT -->|POST| API_IN
    API_IN -->|Create Context| DB
    API_OUT -->|Result| OC_EXT
    OC_EXT -->|Send Reply| OC_GW
```

**Contract**:

**Inbound**:
```json
POST /api/inbound-message
{
  "raw_input": "user message",
  "channel": "openclaw",
  "channel_user_id": "openclaw-user-id",
  "reply_metadata": {
    "session_key": "openclaw-session",
    "channel_type": "telegram|slack|whatsapp|..."
  }
}
```

**Outbound**:
```json
// Reads from outbound_deliveries where channel = 'openclaw'
{
  "context_id": "uuid",
  "payload": "aggregated response text",
  "channel_extra": {
    "session_key": "openclaw-session",
    "channel_type": "telegram"
  }
}
```

### 3.2 Redis Context Storage Pattern

```javascript
// Context operations
const CONTEXT_TTL = 90 * 24 * 60 * 60; // 90 days

// Save context
async function saveContext(userId, context) {
  const key = `context:${userId}`;
  await redis.multi()
    .set(`${key}:provider`, context.provider || 'nvidia')
    .lpush(`${key}:messages`, JSON.stringify(context.messages))
    .expire(`${key}:messages`, CONTEXT_TTL)
    .hset(`${key}:metadata`, context.metadata || {})
    .expire(key, CONTEXT_TTL)
    .exec();
}

// Get context
async function getContext(userId) {
  const key = `context:${userId}`;
  const [provider, messages, metadata] = await Promise.all([
    redis.get(`${key}:provider`),
    redis.lrange(`${key}:messages`, 0, -1),
    redis.hgetall(`${key}:metadata`)
  ]);
  return {
    provider,
    messages: messages.map(m => JSON.parse(m)),
    metadata
  };
}
```

### 3.3 Supabase Schema Additions

**Existing Tables** (from [`infra/supabase-schema.sql`](infra/supabase-schema.sql)):

| Table | Purpose |
|-------|---------|
| `proxy_context` | User input and metadata |
| `agent_tasks` | Delegated tasks |
| `agent_memories` | Agent personality (markdown) |
| `execution_logs` | Task execution logs |
| `proxy_stats` | User stats and achievements |
| `generated_worlds` | World generator outputs |
| `office_instances` | Office state |
| `agent_locks` | Distributed locking |
| `outbound_deliveries` | Channel delivery queue |

**No Schema Changes Required** - all necessary tables exist.

---

## 4. Free Hosting Map

| Component | Hosting Platform | Free Tier Limits | URL/Notes |
|-----------|------------------|------------------|-----------|
| **ProxyOS Backend** | HuggingFace Spaces | 2 concurrent, 6hr/day | taz7770-proxyos-backend.hf.space |
| **Web App** | Vercel | 100GB bandwidth/mo | proxy-os.vercel.app |
| **Database** | Supabase | 500MB, 2GB transfer | Project: proxyos-db |
| **Redis** | Upstash | 10K commands/day | Redis instance |
| **OpenClaw** | Fly.io | 3 shared-CPU VMs | moltbot-damp-fog-7456.fly.dev |
| **NVIDIA NIM** | NVIDIA | Free tier API | api.nvidia.com |
| **Groq** | Groq | Free tier | api.groq.com |
| **Z.ai** | Z.ai | Free GLM-4 | api.z.ai |
| **OpenCode** | OpenCode | Free tier | api.opencode.ai |
| **OpenRouter** | OpenRouter | Free credits | openrouter.ai |
| **Claude** | Anthropic | $5 free credits/mo | api.anthropic.com |

### 4.1 Hosting Architecture

```mermaid
flowchart TB
    subgraph HF_Space["HuggingFace Spaces (Free)"]
        BE[ProxyOS Backend<br/>server.js]
        TG_A[Telegram<br/>Adapter]
        SL_A[Slack<br/>Adapter]
    end
    
    subgraph Vercel_App["Vercel (Free Tier)"]
        WEB[Next.js Web App<br/>apps/web]
    end
    
    subgraph Supabase_Cloud["Supabase (Free Tier)"]
        DB[(PostgreSQL<br/>+ Realtime)]
    end
    
    subgraph Upstash_Cloud["Upstash (Free Tier)"]
        REDIS[(Redis<br/>KV Store)]
    end
    
    subgraph Fly_IO["Fly.io (Paid + Free)"]
        OC[OpenClaw<br/>Gateway]
    end
    
    subgraph External_LLM["External LLM Providers"]
        NV[NVIDIA]
        GR[Groq]
        ZA[Z.ai]
        OC2[OpenCode]
        OR[OpenRouter]
        CL[Claude]
    end
    
    BE --> DB
    BE --> REDIS
    BE --> NV
    BE --> GR
    BE --> ZA
    BE --> OC2
    BE --> OR
    BE --> CL
    
    WEB --> BE
    TG_A --> BE
    SL_A --> BE
    
    OC -.->|Bridge| BE
```

---

## 5. Implementation Phases

### Phase 4A: OpenClaw Bridge Extension (COMPLETED)

The OpenClaw Bridge extension is now implemented. Here's what was created:

**Files Created:**
- `Openclaw/extensions/proxyos-bridge/index.ts` - Extension entry point
- `Openclaw/extensions/proxyos-bridge/src/channel.ts` - Channel implementation for OpenClaw
- `Openclaw/extensions/proxyos-bridge/src/runtime.ts` - Runtime hooks and registration
- `Openclaw/extensions/proxyos-bridge/src/config.ts` - Configuration schema and parsing
- `Openclaw/extensions/proxyos-bridge/src/proxyos-channel.ts` - Core bridge communication logic
- `Openclaw/extensions/proxyos-bridge/src/proxyos-channel.test.ts` - Tests for the bridge functionality
- `Openclaw/extensions/proxyos-bridge/openclaw.plugin.json` - Plugin manifest
- `Openclaw/extensions/proxyos-bridge/package.json` - Package dependencies and metadata

**Key Features:**
1. **Configuration Options**: Backend URL, API key, poll intervals, channels, LLM provider selection
2. **Health Check**: Connection test to ProxyOS backend
3. **Message Sending**: Sends messages to ProxyOS backend with context management
4. **Status Tracking**: Polls for task completion and delivery status
5. **Error Handling**: Handles API errors and network failures
6. **Idempotency**: Prevents duplicate messages

**API Integration:**
- Sends messages to `/api/openclaw-message` endpoint
- Polls `/api/context/:id/status` for task status
- Retrieves results from `/api/context/:id/result`

**Deployment Status:**
- ProxyOS backend deployed at: `https://taz7770-proxyos-backend.hf.space`
- OpenClaw deployed on Fly.io at: `moltbot-damp-fog-7456`
- Bridge extension ready for integration

**Duration**: 2-3 sessions

**Tasks**:
- [ ] Design OpenClaw extension structure in `Openclaw/extensions/proxyos-bridge/`
- [ ] Implement inbound message forwarding to `/api/inbound-message`
- [ ] Implement delivery worker reading `outbound_deliveries`
- [ ] Add OpenClaw Gateway Token authentication
- [ ] Test with single channel (Telegram via OpenClaw)

**Deliverables**:
- OpenClaw extension code
- Deployment configuration
- Integration test

### Phase 4B: Redis Persistent Memory

**Duration**: 2 sessions

**Tasks**:
- [ ] Set up Upstash Redis account
- [ ] Add Redis client to backend
- [ ] Implement context storage using Redis
- [ ] Add TTL management (90 days)
- [ ] Migrate from in-memory Map
- [ ] Test session persistence

**Deliverables**:
- Redis integration code
- Updated environment variables
- Migration documentation

### Phase 4C: Claude Provider Integration

**Duration**: 1 session

**Tasks**:
- [ ] Add Anthropic SDK dependency
- [ ] Implement Claude provider in failover chain
- [ ] Add to providers.json configuration
- [ ] Test Claude-specific prompts

**Deliverables**:
- Claude provider implementation
- Provider configuration

### Phase 4D: End-to-End Testing

**Duration**: 2 sessions

**Tasks**:
- [ ] Test Telegram → ProxyOS → Telegram flow
- [ ] Test Slack → ProxyOS → Slack flow
- [ ] Test OpenClaw → ProxyOS → OpenClaw flow
- [ ] Test Redis context persistence
- [ ] Load test with multiple concurrent users
- [ ] Document troubleshooting procedures

**Deliverables**:
- Test results
- Troubleshooting guide
- Performance baseline

### Phase 5: Future Enhancements (Out of Scope)

- Voice processing (Superpowers integration)
- WhatsApp channel support
- Multi-instance scaling with Redis
- Advanced gamification features

---

## 6. Environment Variables Required

### 6.1 Backend Environment Variables

```bash
# =============================================================================
# SERVER CONFIGURATION
# =============================================================================
PORT=7860
NODE_ENV=production

# =============================================================================
# SUPABASE (Database + Realtime)
# =============================================================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# =============================================================================
# UPSTASH REDIS (Persistent Context)
# =============================================================================
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# =============================================================================
# LLM PROVIDERS (Free Tier)
# =============================================================================

# NVIDIA NIM - https://build.nvidia.com
NVIDIA_API_KEY=your-nvidia-api-key
NVIDIA_MODEL=nvidia/llama-3.1-nemotron-70b-instruct

# Groq - https://console.groq.com
GROQ_API_KEY=your-groq-api-key

# Z.ai (Free GLM-4) - https://z.ai
ZAI_API_KEY=your-zai-api-key

# OpenCode - https://opencode.ai
OPENCODE_API_KEY=your-opencode-api-key

# OpenRouter - https://openrouter.ai
OPENROUTER_API_KEY=your-openrouter-api-key

# Anthropic Claude (NEW) - https://console.anthropic.com
ANTHROPIC_API_KEY=your-anthropic-api-key

# =============================================================================
# ADAPTERS
# =============================================================================

# Telegram - @BotFather
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_ENABLED=true
TELEGRAM_ALLOWED_USERS=123456789

# Slack - https://api.slack.com/apps
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# =============================================================================
# PROXYOS SERVICES
# =============================================================================
PROXYOS_BACKEND_URL=https://taz7770-proxyos-backend.hf.space

# OpenClaw Cloud Fallback
OPENCLOUD_API_URL=https://taz7770-proxyos-openclaw.hf.space/api/agent

# =============================================================================
# OPENCLAW BRIDGE (Phase 4A)
# =============================================================================
OPENCLAW_GATEWAY_TOKEN=your-openclaw-gateway-token
OPENCLAW_BRIDGE_ENABLED=true
```

### 6.2 OpenClaw Environment Variables

```bash
# OpenClaw Gateway Token (from Fly.io secrets)
OPENCLAW_GATEWAY_TOKEN=your-gateway-token

# ProxyOS Bridge Configuration
OPENCLOUD_API_URL=https://taz7770-proxyos-backend.hf.space/api/inbound-message

# Default LLM Model
OPENCLAW_DEFAULT_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
```

### 6.3 Web App Environment Variables

```bash
# Next.js Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ProxyOS Backend
NEXT_PUBLIC_PROXYOS_API=https://taz7770-proxyos-backend.hf.space
```

---

## 7. API Reference Summary

### 7.1 Inbound Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/feed-context` | POST | Web app input |
| `/api/inbound-message` | POST | Messaging adapter input |
| `/api/openclaw-message` | POST | OpenClaw bridge input (Phase 4) |

**Request Body (openclaw-message)**:
```json
{
  "raw_input": "string (required)",
  "channel": "telegram|slack|whatsapp|discord|etc",
  "channel_user_id": "string (required)",
  "reply_metadata": {
    "chat_id": "123",
    "thread_ts": "optional"
  },
  "provider": "optional provider override"
}
```

**Response**:
```json
{
  "context_id": "uuid",
  "status": "processing|completed|error",
  "delegation": [
    { "agent": "minion", "task_id": "123" },
    { "agent": "scout", "task_id": "456" }
  ],
  "llm_response": "optional immediate response",
  "provider": "nvidia|groq|zai|opencode|openrouter"
}
```

### 7.2 Outbound Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/context/:id/status` | GET | Task status |
| `/api/context/:id/result` | GET | Aggregated result |

**Response (result)**:
```json
{
  "context_id": "uuid",
  "status": "completed|pending|error",
  "summary": "short summary",
  "outputs": [
    {
      "agent_role": "minion|scout|sage",
      "status": "success|failed",
      "output_log": "agent output"
    }
  ],
  "aggregated_text": "full response for channel"
}
```

---

## 8. Security Considerations

1. **API Authentication**: All adapters use backend URL + proper channel credentials
2. **Rate Limiting**: Telegram adapter limits to 20 msg/min
3. **User Allowlisting**: Optional `TELEGRAM_ALLOWED_USERS` for access control
4. **Secret Management**: All secrets via environment variables, never committed
5. **Input Validation**: All user input sanitized before processing

---

## 9. Monitoring & Observability

### 9.1 Health Checks

- Backend: `GET /health` on HuggingFace Spaces
- Supabase: Database connection test
- Redis: Upstash dashboard

### 9.2 Logging Convention

| Prefix | Component |
|--------|-----------|
| `[ProxyOS backend]` | Express server logs |
| `[ProxyOS]` | Provider/agent logs |
| `[Telegram Adapter]` | Telegram bot logs |
| `[Slack Adapter]` | Slack app logs |
| `[OpenClaw Bridge]` | Bridge extension logs |

---

## 10. Success Criteria

- [ ] User can send message via Telegram and receive reply from ProxyOS
- [ ] User can send message via Slack and receive reply from ProxyOS
- [ ] OpenClaw can forward messages to ProxyOS and deliver replies
- [ ] Context persists across backend restarts (Redis)
- [ ] Claude provider returns valid responses
- [ ] All components run on free tiers without hitting limits

---

## Appendix A: File Structure

```
ProxyOS/
├── apps/
│   ├── backend/
│   │   ├── server.js              # Express backend
│   │   ├── providers/
│   │   │   ├── configs/
│   │   │   │   └── providers.json # LLM provider config
│   │   │   ├── failover-manager.js
│   │   │   └── provider-checks.js
│   │   └── adapters/
│   │       ├── telegram.js
│   │       └── slack.js
│   └── web/                       # Next.js web app
│       └── src/
│           ├── app/
│           └── components/
├── adapters/
│   ├── telegram.js                # Standalone Telegram adapter
│   └── slack.js                   # Standalone Slack adapter
├── agents/                        # Agent soul/memory markdown
│   ├── minion/
│   ├── scout/
│   └── sage/
├── Openclaw/                      # OpenClaw codebase
│   ├── extensions/
│   │   └── voice-call/           # Existing voice extension
│   └── fly.toml                  # Fly.io config
├── infra/
│   └── supabase-schema.sql       # Database schema
└── docs/
    └── ARCHITECTURE_COMPLETE.md   # This document
```

---

## Appendix B: Quick Reference Card

| Need | Solution |
|------|----------|
| Add new LLM provider | Edit `providers.json`, add case in `server.js` |
| Add new messaging channel | Implement adapter, use `/api/inbound-message` |
| Scale to multiple instances | Replace Map() with Redis |
| Debug LLM calls | Check `[ProxyOS]` logs, enable verbose logging |
| Monitor tasks | Supabase Realtime subscriptions |

---

*Document Version: 1.0*  
*Created: 2026-02-19*  
*Last Modified: 2026-02-19*
