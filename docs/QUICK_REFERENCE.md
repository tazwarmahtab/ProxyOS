# Quick Reference: ProxyOS + Openclaw Integration

**For**: Quick lookup during implementation  
**Full Context**: See `CONTEXT_FOR_CONTINUATION.md`

---

## 🎯 Goal

Enable users to interact with ProxyOS AI Office from **Telegram, Slack, WhatsApp** (via Openclaw) in addition to the app UI.

---

## ✅ Implementation Status

**All Phases 1-3 Complete!**

- [x] `outbound_deliveries` table added to `infra/supabase-schema.sql`
- [x] `POST /api/inbound-message` implemented in `server.js`
- [x] `GET /api/context/:id/status` implemented in `server.js`
- [x] `GET /api/context/:id/result` implemented in `server.js`
- [x] Context completion logic added
- [x] Telegram adapter created (`adapters/telegram.js`)
- [x] Slack adapter created (`adapters/slack.js`)

---

## 🏗️ Architecture

```
User (Telegram/Slack) 
  → Channel Adapter 
  → POST /api/inbound-message (ProxyOS)
  → Same delegation → Tasks → Agents execute
  → When done → Write to outbound_deliveries
  → Adapter reads → Sends reply back
```

---

## 🔌 New API Endpoints

**POST /api/inbound-message**
```json
{
  "raw_input": "string",
  "channel": "telegram" | "slack",
  "channel_user_id": "string",
  "reply_metadata": { "chat_id": 123 },
  "project_tag": "optional"
}
```
Returns: `{ status: 'success', context_id }`

**GET /api/context/:id/status**
Returns: `{ status: 'pending'|'working'|'completed', tasks_done, tasks_total }`

**GET /api/context/:id/result**
Returns: `{ context_id, status: 'completed', aggregated_text: '...' }` (when done)

---

## 🗄️ New Table: outbound_deliveries

```sql
create table public.outbound_deliveries (
  id uuid primary key,
  context_id uuid references proxy_context(id),
  channel varchar(50),           -- 'telegram' | 'slack'
  channel_user_id text,
  channel_extra jsonb,           -- { chat_id, thread_ts }
  payload text default '',        -- filled when context done
  status varchar(20) default 'pending',  -- pending | sent | failed
  sent_at timestamptz,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz
);
```

---

## 📝 Key Code Patterns

### Check if context is done
```javascript
const { data: tasks } = await supabase
  .from('agent_tasks')
  .select('*')
  .eq('context_id', contextId);

const allDone = tasks.every(t => 
  ['success', 'failed', 'halted'].includes(t.status)
);
```

### Aggregate outputs
```javascript
const aggregatedText = tasks
  .filter(t => t.status === 'success' && t.output_log)
  .map(t => `[${t.agent_role}]: ${t.output_log}`)
  .join('\n\n');
```

### Update delivery payload
```javascript
await supabase
  .from('outbound_deliveries')
  .update({ 
    payload: aggregatedText,
    updated_at: new Date().toISOString()
  })
  .eq('context_id', contextId)
  .eq('status', 'pending');
```

---

## 📁 Files to Modify

**Phase 1**:
- `infra/supabase-schema.sql` - Add table
- `apps/backend/server.js` - Add routes

**Phase 2** (Telegram):
- `apps/backend/package.json` - Add `node-telegram-bot-api` or `grammy`
- `apps/backend/adapters/telegram.js` - Create adapter
- `.env.example` - Add `TELEGRAM_BOT_TOKEN`

---

## 🧪 Test Commands

```bash
# Test inbound-message
curl -X POST http://localhost:3000/api/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "Research Node.js best practices",
    "channel": "telegram",
    "channel_user_id": "test_123",
    "reply_metadata": { "chat_id": 123 }
  }'

# Test status
curl http://localhost:3000/api/context/{context_id}/status

# Test result
curl http://localhost:3000/api/context/{context_id}/result
```

---

## ⚠️ Important Notes

- **Don't break app UI** - `feed-context` must continue working
- **Follow existing patterns** - Look at `feed-context` route as template
- **Single brain** - All logic stays in ProxyOS, adapters are thin
- **Test incrementally** - Each endpoint before moving on

---

## 🚀 Next Steps

1. Read `CONTEXT_FOR_CONTINUATION.md` (full context)
2. Read `OPENCLAW_INTEGRATION_PLAN.md` (detailed plan)
3. Start Phase 1: Add table + implement endpoints
4. Test with curl
5. Move to Phase 2: Telegram adapter
