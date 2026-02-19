# 🚀 START HERE: ProxyOS + Openclaw Integration

**Welcome!** This guide tells you exactly what to read and in what order to continue building the ProxyOS + Openclaw integration.

---

## 📖 Reading Order (5 minutes)

1. **Read this file** (you're here ✅)
2. **Read `QUICK_REFERENCE.md`** (2 min) - Quick overview and patterns
3. **Read `CONTEXT_FOR_CONTINUATION.md`** (10 min) - Complete context
4. **Read `OPENCLAW_INTEGRATION_PLAN.md`** (15 min) - Detailed architecture
5. **Deploy the system** (see below)

---

## 🎯 What We're Building

**Goal**: Let users interact with ProxyOS AI Office from **Telegram, Slack, WhatsApp** (via Openclaw) in addition to the app UI.

**Current State**: 
- ✅ ProxyOS app UI works (Command Center → agents → tasks)
- ✅ Backend has `/api/feed-context` endpoint
- ✅ **NEW**: Backend has `/api/inbound-message`, `/api/context/:id/status`, `/api/context/:id/result` endpoints
- ✅ **NEW**: `outbound_deliveries` table created
- ✅ **NEW**: Telegram adapter ready (`adapters/telegram.js`)
- ✅ **NEW**: Slack adapter ready (`adapters/slack.js`)

---

## ✅ Implementation Status

### Phase 1: Backend Contract + Delivery ✅ COMPLETE
- [x] `outbound_deliveries` table added to schema
- [x] `POST /api/inbound-message` implemented
- [x] `GET /api/context/:id/status` implemented
- [x] `GET /api/context/:id/result` implemented
- [x] Context completion logic added

### Phase 2: Telegram Adapter ✅ COMPLETE
- [x] Grammy library added to package.json
- [x] `adapters/telegram.js` created
- [x] `/start` and `/help` commands
- [x] Message polling and reply delivery

### Phase 3: Slack Adapter ✅ COMPLETE
- [x] `@slack/bolt` library added
- [x] `adapters/slack.js` created
- [x] Direct messages, mentions, `/proxyos` command
- [x] Reaction feedback while processing

### Phase 4: Openclaw Bridge (Optional Future)
- [ ] Design Openclaw extension for all other channels

---

## 🏁 Quick Start: Deploy

### 1. Database Migration

Run the new table schema in Supabase SQL Editor:
```sql
-- See infra/supabase-schema.sql for the outbound_deliveries table
```

### 2. Install Dependencies

```bash
cd apps/backend
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:
```
# Required for all
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
GROQ_API_KEY=your-groq-key

# For Telegram
TELEGRAM_BOT_TOKEN=your-bot-token

# For Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret
SLACK_APP_TOKEN=xapp-your-token
```

### 4. Run Services

```bash
# Backend (required)
npm start

# Telegram adapter (optional)
npm run start:telegram

# Slack adapter (optional)
npm run start:slack
```

---

## 🧪 Test Commands

```bash
# Test inbound-message
curl -X POST http://localhost:7860/api/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "Research Node.js best practices",
    "channel": "telegram",
    "channel_user_id": "test_123",
    "reply_metadata": { "chat_id": 123 }
  }'

# Test status
curl http://localhost:7860/api/context/{context_id}/status

# Test result
curl http://localhost:7860/api/context/{context_id}/result
```

---

## 📚 Document Guide

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **START_HERE.md** | This file - overview and reading order | First |
| **QUICK_REFERENCE.md** | Quick lookup during coding | Keep open while coding |
| **CONTEXT_FOR_CONTINUATION.md** | Complete context (architecture, current state, decisions) | Before starting implementation |
| **OPENCLAW_INTEGRATION_PLAN.md** | Detailed integration plan (phases, API contracts, flows) | Before starting implementation |
| **DEPLOYMENT_ORACLE.md** | How to deploy backend to Oracle Cloud | When deploying |

---

## 🎓 Key Concepts (30 seconds)

1. **ProxyOS = Brain**: All delegation, task processing, memory stays in ProxyOS
2. **Adapters = Thin Layer**: Telegram/Slack adapters only forward messages and deliver replies
3. **Delivery Table**: `outbound_deliveries` tracks "where to send reply" and "what to send"
4. **Same Logic**: `inbound-message` uses same delegation as `feed-context` (no duplication)

---

## 🆘 If You're Stuck

1. **Check `QUICK_REFERENCE.md`** - Code patterns and examples
2. **Check `adapters/README.md`** - Adapter-specific documentation
3. **Look at existing code** - `POST /api/feed-context` route is your template
4. **Test incrementally** - Each endpoint before moving on

---

## 🎯 Next Action

**Right now**: 
1. Run the SQL migration in Supabase
2. Configure your `.env` 
3. Start the backend: `npm start`
4. (Optional) Start Telegram: `npm run start:telegram`
5. (Optional) Start Slack: `npm run start:slack`

**Good luck! 🚀**
