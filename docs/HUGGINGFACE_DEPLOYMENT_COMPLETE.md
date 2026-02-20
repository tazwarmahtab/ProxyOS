# ProxyOS HuggingFace Spaces Complete Deployment Guide

**Target**: HuggingFace Spaces Only (No Fly.io)  
**Last Updated**: 2026-02-20  
**Version**: 2.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables](#2-environment-variables)
3. [Step-by-Step Deployment](#3-step-by-step-deployment)
4. [OpenClaw Bridge Configuration](#4-openclaw-bridge-configuration)
5. [Telegram Bot Setup](#5-telegram-bot-setup)
6. [Testing Checklist](#6-testing-checklist)

---

## 1. Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROXYOS HF SPACES ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────┐         ┌──────────────────────┐
  │  HF Space 1          │         │  HF Space 2          │
  │  taz7770-proxyos-    │         │  taz7770-proxyos-    │
  │       backend        │         │      openclaw        │
  │                      │         │                      │
  │  ┌────────────────┐  │         │  ┌────────────────┐  │
  │  │ Express.js     │  │         │  │ OpenClaw Core  │  │
  │  │ Server         │  │         │  │ + Extensions   │  │
  │  │ (Port 7860)    │  │         │  │                │  │
  │  └────────┬───────┘  │         │  └────────┬───────┘  │
  │           │          │         │           │          │
  │  ┌────────▼───────┐  │         │  ┌────────▼───────┐  │
  │  │ LLM Provider  │  │         │  │ Multi-Channel  │  │
  │  │ Failover       │  │         │  │ Messaging      │  │
  │  │ Manager        │  │         │  │ (TG/Slack/WA)  │  │
  │  └────────┬───────┘  │         │  └────────┬───────┘  │
  │           │          │         │           │          │
  │  ┌────────▼───────┐  │         │  │           │          │
  │  │ Telegram/Slack │◄─┼─────────┼──┤           │          │
  │  │ Adapters       │  │         │  └───────────▼─────────┘
  │  └────────────────┘  │         │           │
  └──────────┬──────────┘         │           │
             │                     │           │
             │                     │           ▼
             │                     │  ┌──────────────────┐
             │                     │  │ OpenClaw Bridge  │
             │                     │  │ Extension        │
             │                     │  │                  │
             │                     │  │ Forwards to      │
             └─────────────────────┼──│ ProxyOS Backend  │
                                   │  └──────────────────┘
                                   └─────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │                      EXTERNAL SERVICES                         │
  │                                                                 │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
  │  │   Supabase    │  │   Upstash    │  │   LLM Providers     │ │
  │  │  (Free Tier)  │  │  (Free Tier) │  │   (Multiple Free)   │ │
  │  │               │  │              │  │                     │ │
  │  │ • Database    │  │ • Context    │  │ • NVIDIA NIM       │ │
  │  │ • Realtime    │  │   Storage    │  │ • Groq              │ │
  │  │ • Storage     │  │ • Caching    │  │ • Z.ai              │ │
  │  └──────────────┘  └──────────────┘  │ • OpenCode          │ │
  │                                       │ • OpenRouter        │ │
  │                                       │ • Anthropic Claude │ │
  │                                       └──────────────────────┘ │
  └────────────────────────────────────────────────────────────────┘
```

### HF Space 1: `taz7770-proxyos-backend`

| Component | Description |
|-----------|-------------|
| **Runtime** | Node.js 18+ on HuggingFace Spaces |
| **Port** | 7860 |
| **Framework** | Express.js |
| **Purpose** | Main API server, LLM orchestration, agent management |
| **Features** | LLM provider failover (nvidia → groq → zai → opencode → openrouter → anthropic), Telegram/Slack adapters, context persistence |
| **Agents** | minion (technical), scout (research), sage (strategy) |

### HF Space 2: `taz7770-proxyos-openclaw`

| Component | Description |
|-----------|-------------|
| **Runtime** | OpenClaw with ProxyOS Bridge extension |
| **Purpose** | Multi-channel messaging hub |
| **Channels** | Telegram, Slack, WhatsApp, Discord, Webhooks |
| **Fallback** | Routes to ProxyOS backend for AI responses |

### External Services (All Free Tier)

| Service | Purpose | Free Tier Limits |
|---------|---------|------------------|
| **Supabase** | Database, Realtime, Auth | 500MB DB, 2GB storage |
| **Upstash** | Redis (context/caching) | 10K commands/month |
| **NVIDIA NIM** | LLM inference | Free API keys |
| **Groq** | Fast LLM inference | Free tier available |
| **Z.ai** | GLM-4 models | Free API keys |
| **OpenCode** | Code models | Experimental |
| **OpenRouter** | Multi-model gateway | Free tier |
| **Anthropic** | Claude models | Free tier available |

---

## 2. Environment Variables

### ProxyOS Backend HF Space (`taz7770-proxyos-backend`)

Set these in your HuggingFace Space Settings → Variables and secrets:

| Variable | Required | Description | Where to Get |
|----------|----------|-------------|--------------|
| `PORT` | Yes | Server port (use `7860`) | Default |
| `NODE_ENV` | Yes | Set to `production` | - |
| `SUPABASE_URL` | Yes | Supabase project URL | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Yes | Service role key | Supabase → Settings → API |
| `REDIS_URL` | Yes | Upstash Redis connection | Upstash → REST API |
| `NVIDIA_API_KEY` | Recommended | NVIDIA NIM API | [build.nvidia.com](https://build.nvidia.com) |
| `GROQ_API_KEY` | Recommended | Groq API | [console.groq.com](https://console.groq.com) |
| `ZAI_API_KEY` | Optional | Z.ai API (GLM-4) | [z.ai](https://z.ai) |
| `OPENCODE_API_KEY` | Optional | OpenCode API | [opencode.ai](https://opencode.ai) |
| `OPENROUTER_API_KEY` | Optional | OpenRouter API | [openrouter.ai](https://openrouter.ai) |
| `ANTHROPIC_API_KEY` | Optional | Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com) |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token | @BotFather |
| `TELEGRAM_ENABLED` | Optional | Enable Telegram (`true`/`false`) | - |
| `TELEGRAM_ALLOWED_USERS` | Optional | Comma-separated user IDs | - |
| `SLACK_BOT_TOKEN` | Optional | Slack bot token | Slack App settings |
| `SLACK_SIGNING_SECRET` | Optional | Slack signing secret | Slack App settings |
| `OPENCLOUD_API_URL` | Yes | OpenClaw HF Space URL | Your HF Space URL + `/api/agent` |

### Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Root endpoint, returns swarm status |
| `/health` | GET | Health check |
| `/api/feed-context` | POST | Web app context input |
| `/api/inbound-message` | POST | Messaging adapter input |
| `/api/agent` | POST | Direct agent call (OpenClaw bridge) |
| `/api/context/:id/status` | GET | Poll task status |
| `/api/context/:id/result` | GET | Get aggregated results |
| `/api/swarm-status` | GET | Get recent tasks |
| `/api/telegram/webhook` | POST | Telegram webhook handler |

#### Example `OPENCLOUD_API_URL`

```
https://taz7770-proxyos-openclaw.hf.space/api/agent
```

### OpenClaw HF Space (`taz7770-proxyos-openclaw`)

| Variable | Required | Description | Where to Get |
|----------|----------|-------------|--------------|
| `PORT` | Yes | Server port (use `7860`) | Default |
| `NODE_ENV` | Yes | Set to `production` | - |
| `OPENCLOUD_PROXYOS_URL` | Yes | ProxyOS backend URL | Your HF Space URL |
| `OPENCLOUD_PROXYOS_API_KEY` | Yes | API key for authentication | Generate random string |

---

## 3. Step-by-Step Deployment

### Phase 1: Set Up External Services

#### Step 1.1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Fill in:
   - **Organization**: Your account
   - **Name**: `proxyos`
   - **Database password**: (记住这个密码)
   - **Region**: Choose closest to you
4. Click **Create new project** (wait ~2 minutes)

#### Step 1.2: Initialize Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Copy the contents of [`infra/supabase-schema.sql`](../infra/supabase-schema.sql)
3. Paste and run the SQL
4. Verify tables created:
   - `agent_tasks`
   - `agent_memories`
   - `proxy_context`
   - `proxy_stats`
   - `outbound_deliveries`

#### Step 1.3: Enable Realtime

1. Go to **Database → Replication**
2. Ensure Realtime is enabled for:
   - `agent_tasks`
   - `proxy_context`
   - `proxy_stats`
   - `outbound_deliveries`

#### Step 1.4: Get Supabase Credentials

1. Go to **Settings → API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** (under "Project API keys") → `SUPABASE_SERVICE_KEY`

#### Step 1.5: Set Up Upstash Redis

1. Go to [upstash.com](https://upstash.com) and sign in
2. Click **Create Database**
3. Fill in:
   - **Name**: `proxyos`
   - **Type**: Redis
   - **Region**: Choose closest to you
4. Click **Create**
5. Copy the **REST API URL** → `REDIS_URL`

#### Step 1.6: Get LLM API Keys

At least one required (recommended: NVIDIA + Groq):

| Provider | URL | Free Tier |
|----------|-----|-----------|
| **NVIDIA NIM** | [build.nvidia.com](https://build.nvidia.com) | Yes |
| **Groq** | [console.groq.com](https://console.groq.com) | Yes |
| **Z.ai** | [z.ai](https://z.ai) | Yes |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | Yes |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | Yes |
| **OpenCode** | [opencode.ai](https://opencode.ai) | Experimental |

### Phase 2: Configure ProxyOS Backend HF Space

#### Step 2.1: Link Your GitHub Repository

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces)
2. Click **New Space**
3. Fill in:
   - **Space name**: `proxyos-backend` (or `taz7770-proxyos-backend` for consistency)
   - **SDK**: **Docker**
   - **Repository**: Select **Link to GitHub repository**
   - **Select repository**: Choose your ProxyOS repo
   - **Root directory**: `apps/backend`
   - **Visibility**: Public or Private
4. Click **Create Space**

#### Step 2.2: Set Environment Variables

1. Go to your Space → **Settings** → **Variables and secrets**
2. Add all required variables from [Section 2.1](#proxyos-backend-hf-space-taz7770-proxyos-backend)
3. Click **Save changes**

#### Step 2.3: Verify Backend Deployment

1. Wait for build to complete (~2-3 minutes)
2. Check **Logs** tab for any errors
3. Visit your Space URL: `https://taz7770-proxyos-backend.hf.space`
4. You should see:
   ```json
   {
     "status": "ProxyOS Swarm Online",
     "agents": ["minion", "scout", "sage"],
     "timestamp": "2026-02-20T..."
   }
   ```

### Phase 3: Configure OpenClaw HF Space

#### Step 3.1: Create OpenClaw Space

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces)
2. Click **New Space**
3. Fill in:
   - **Space name**: `proxyos-openclaw` (or `taz7770-proxyos-openclaw`)
   - **SDK**: **Docker**
   - **Repository**: Select **Link to GitHub repository**
   - **Select repository**: Choose your ProxyOS repo
   - **Root directory**: `Openclaw`
   - **Hardware**: **CPU basic** (or upgrade if needed)
   - **Visibility**: Public or Private
4. Click **Create Space**

#### Step 3.2: Set OpenClaw Environment Variables

1. Go to your Space → **Settings** → **Variables and secrets**
2. Add:
   ```
   PORT=7860
   NODE_ENV=production
   OPENCLOUD_PROXYOS_URL=https://taz7770-proxyos-backend.hf.space
   OPENCLOUD_PROXYOS_API_KEY=your-secure-random-string
   ```
3. Click **Save changes**

#### Step 3.3: Build OpenClaw with Bridge Extension

The OpenClaw Space needs the ProxyOS Bridge extension built in. Ensure your Openclaw Dockerfile includes the bridge extension setup:

```dockerfile
# Openclaw Dockerfile should include bridge extension
# Check Openclaw/Dockerfile in your repo
```

If not included, you'll need to modify the Dockerfile to install the bridge extension.

### Phase 4: Push Code Updates to HF Spaces

#### Option A: Automatic (GitHub Push)

When you push to GitHub, HuggingFace Spaces linked to your repo will automatically rebuild:

```bash
# Make your changes
git add .
git commit -m "Update: your changes"
git push origin main
```

#### Option B: Manual Rebuild

1. Go to your HF Space
2. Click **Rebuild** in the header
3. Wait for build to complete

---

## 4. OpenClaw Bridge Configuration

The ProxyOS Bridge extension enables OpenClaw to forward messages to the ProxyOS backend for AI processing.

### How It Works

```
User Message (Telegram/Slack/WhatsApp)
         │
         ▼
   OpenClaw Core
         │
         ▼
┌────────────────────┐
│ ProxyOS Bridge     │
│ Extension          │
└─────────┬──────────┘
          │
          ▼
  ProxyOS Backend API
  (/api/agent)
          │
          ▼
   LLM Provider Chain
   (NVIDIA → Groq → Z.ai → OpenCode → OpenRouter → Anthropic)
          │
          ▼
   Response back to
   OpenClaw → User
```

### Enable the Bridge Extension

#### Step 4.1: Configure Bridge in OpenClaw

The Bridge extension should be enabled in your OpenClaw configuration. Add to your Openclaw setup:

```javascript
// OpenClaw configuration
{
  "extensions": {
    "proxyos-bridge": {
      "enabled": true,
      "backendUrl": "https://taz7770-proxyos-backend.hf.space/api/agent",
      "apiKey": "your-secure-random-string"
    }
  }
}
```

#### Step 4.2: Set API Key in Both Spaces

1. Generate a secure random string:
   ```bash
   openssl rand -base64 32
   ```

2. Add to **ProxyOS Backend** HF Space:
   - Variable: `OPENCLOUD_API_KEY`
   - Value: (your generated string)

3. Add to **OpenClaw** HF Space:
   - Variable: `OPENCLOUD_PROXYOS_API_KEY`
   - Value: (same generated string)

#### Step 4.3: Verify Bridge Connection

Test the bridge is working:

```bash
curl -X POST https://taz7770-proxyos-backend.hf.space/api/agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-random-string" \
  -d '{"message": "test", "context": []}'
```

Expected response:
```json
{
  "success": true,
  "response": "AI response...",
  "agent": "minion"
}
```

---

## 5. Telegram Bot Setup

### Step 5.1: Create Your Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow prompts:
   - Bot name: `ProxyOS Bot`
   - Username: `proxyos_bot` (must end in `bot`)
4. Copy the **HTTP API token** (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 5.2: Configure Bot in ProxyOS Backend

1. Go to **ProxyOS Backend HF Space** → **Settings** → **Variables and secrets**
2. Add:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
   TELEGRAM_ENABLED=true
   ```
3. Click **Save**

### Step 5.3: Connect Bot to OpenClaw

#### Option A: OpenClaw Handles Telegram (Recommended)

OpenClaw can connect directly to Telegram:

1. Go to your OpenClaw Space settings
2. Configure Telegram channel:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token
   ```
3. OpenClaw will receive messages and forward to ProxyOS Bridge

#### Option B: Direct Webhook to ProxyOS Backend

If running Telegram adapter directly:

1. Set webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -d "url=https://taz7770-proxyos-backend.hf.space/api/telegram/webhook"
   ```

2. Ensure `TELEGRAM_BOT_TOKEN` is set in your backend Space

### Step 5.4: Test Telegram Bot

1. Open your bot in Telegram
2. Send `/start`
3. You should receive a welcome message from ProxyOS

---

## 6. Testing Checklist

### Health Check Endpoints

| Check | Command | Expected Response |
|-------|---------|-------------------|
| Backend Health | `curl https://taz7770-proxyos-backend.hf.space/` | `{"status": "ProxyOS Swarm Online", ...}` |
| Backend /health | `curl https://taz7770-proxyos-backend.hf.space/health` | `{"status": "healthy", ...}` |
| OpenClaw Health | `curl https://taz7770-proxyos-openclaw.hf.space/` | OpenClaw welcome page or JSON |
| Redis Connection | Check backend logs | No Redis connection errors |

### Message Flow Verification

| Test | Steps | Expected |
|------|-------|----------|
| **Web → Backend** | Send message via web app | Task created in Supabase `agent_tasks` |
| **Backend → LLM** | Check logs | LLM provider called, response received |
| **Telegram → Backend** | Send message to Telegram bot | Message forwarded to `/api/inbound-message` |
| **Backend → Telegram** | Bot responds | User receives AI response |
| **OpenClaw → Bridge** | Send message via OpenClaw channel | Forwards to `/api/agent`, receives response |

### Context Persistence Test

| Test | Steps | Expected |
|------|-------|----------|
| **Redis Storage** | Send multiple messages | Context stored in Upstash |
| **Memory Recall** | Reference previous conversation | Bot remembers context |
| **Context Clear** | Send `/clear` command | Context cleared, fresh conversation |

### Complete Test Script

```bash
# 1. Test backend is up
curl https://taz7770-proxyos-backend.hf.space/

# 2. Test health endpoint
curl https://taz7770-proxyos-backend.hf.space/health

# 3. Test agent endpoint (requires API key)
curl -X POST https://taz7770-proxyos-backend.hf.space/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you do?", "userId": "test-user"}'

# 4. Test inbound message endpoint
curl -X POST https://taz7770-proxyos-backend.hf.space/api/inbound-message \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "platform": "telegram", "userId": "12345"}'

# 5. Check Supabase for tasks
# Go to Supabase Dashboard → Table Editor → agent_tasks
# You should see new rows after tests
```

### Troubleshooting Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Cold start delay | HF Space slept | Wait 10-30s, ping regularly to keep awake |
| 502 Bad Gateway | Build failed | Check logs, verify all env vars set |
| LLM errors | Invalid API key | Verify keys in Settings |
| Telegram not responding | Wrong webhook URL | Update webhook to correct HF Space URL |
| OpenClaw bridge failing | API key mismatch | Ensure same key in both Spaces |

---

## Quick Reference: Commands

### Push Updates to HF
```bash
git add .
git commit -m "Update description"
git push origin main
# HF Spaces auto-rebuilds
```

### Manual Rebuild
```bash
# Go to HF Space → Click "Rebuild"
```

### Check Logs
```bash
# Go to HF Space → Settings → Logs tab
```

### Test API Directly
```bash
curl -X POST https://taz7770-proxyos-backend.hf.space/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "userId": "test"}'
```

---

## Next Steps After Deployment

1. ✅ Deploy ProxyOS Backend on HF Spaces
2. ✅ Deploy OpenClaw on HF Spaces  
3. ✅ Connect Supabase database
4. ✅ Configure Upstash Redis
5. ✅ Set up LLM providers
6. ✅ Configure Telegram bot
7. ✅ Test message flows
8. ⬜ Keep HF Spaces awake (optional: use cron-job to ping)
9. ⬜ Add more channels (Slack, WhatsApp) via OpenClaw

---

## Appendix: Agent System Details

### Agent Roles

| Agent | Role | Description |
|-------|------|-------------|
| **minion** | Technical Execution | Transforms abstract requirements into production-ready code, scripts, and deployment plans. |
| **scout** | Research & Intel | Gathers high-signal information, structures it for immediate use, includes citations. |
| **sage** | Strategy & QA | Enforces Apple-grade quality, cuts bloat, ensures flows feel cinematic and robust. |

### Agent Soul Files

Each agent has a soul file that defines its personality:
- `agents/minion/soul.md` - Technical execution personality
- `agents/scout/soul.md` - Research personality
- `agents/sage/soul.md` - Strategy/QA personality

### Agent Memory Files

Each agent has a memory file for persistence:
- `agents/minion/memory.md`
- `agents/scout/memory.md`
- `agents/sage/memory.md`

### Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Root endpoint, returns swarm status |
| `/health` | GET | Health check |
| `/api/feed-context` | POST | Web app context input |
| `/api/inbound-message` | POST | Messaging adapter input (Telegram/Slack/OpenClaw) |
| `/api/agent` | POST | Direct agent call (OpenClaw bridge) |
| `/api/context/:id/status` | GET | Poll task status |
| `/api/context/:id/result` | GET | Get aggregated results |
| `/api/swarm-status` | GET | Get recent tasks |
| `/api/telegram/webhook` | POST | Telegram webhook handler |

---

*For questions or issues, check the main ProxyOS documentation or open an issue on GitHub.*
