# Project Architecture Rules (Non-Obvious Only)

## System Architecture

```mermaid
flowchart TD
    subgraph Adapters
        TG[Telegram Adapter]
        SL[Slack Adapter]
    end
    
    subgraph Backend
        API[/api/inbound-message/]
        CTX[Context Map - In Memory]
        FO[Failover Manager]
    end
    
    subgraph Providers
        NV[NVIDIA]
        GR[Groq]
        ZA[Z.ai]
        GC[GitHub Copilot]
        OC[OpenCode]
        OR[OpenRouter]
        AN[Anthropic (Claude)]
    end
    
    subgraph Fallback
        OCF[OpenClaw Cloud]
    end
    
    subgraph Database
        SB[(Supabase)]
    end
    
    TG -->|HTTP POST| API
    SL -->|HTTP POST| API
    API --> CTX
    API --> FO
    FO --> NV
    NV -->|fail| GR
    GR -->|fail| ZA
    ZA -->|fail| GC
    GC -->|fail| OC
    OC -->|fail| OR
    OR -->|fail| AN
    AN -->|fail| OCF
    API --> SB
```

## Critical Constraints

**Stateless Providers**: All LLM providers must remain stateless - context is managed centrally in backend's `Map()`.

**HTTP-Based Adapter Protocol**: Adapters never import backend code directly. All communication via `/api/inbound-message` endpoint with payload:
```json
{
  "raw_input": "user message",
  "channel": "telegram|slack",
  "channel_user_id": "user id",
  "reply_metadata": {},
  "provider": "optional provider override"
}
```

**Circuit Breaker Pattern**: Provider failover uses circuit breaker (5 failures → OPEN, 30s reset). Must be respected when adding new providers.

## Database Design

**Agent Memory Storage**: `agent_memories` table uses markdown columns (`soul_markdown`, `memory_markdown`) instead of JSON for personality data.

**Realtime Subscriptions**: Supabase realtime enabled for core tables. Frontend can subscribe to `agent_tasks`, `proxy_context`, `proxy_stats`, `outbound_deliveries`.

**Distributed Locking**: `agent_locks` table provides simple lane locking with expiration.

## Deployment Architecture

- Backend: Hugging Face Spaces (`taz7770-proxyos-backend.hf.space`)
- OpenClaw Cloud: Hugging Face Spaces (`taz7770-proxyos-openclaw.hf.space`)
- Web: Vercel
- Database: Supabase

## Scaling Considerations

- Context storage MUST move to Redis before multi-instance deployment
- Provider circuit breakers are per-instance (not shared)
- Adapters can be scaled independently of backend
