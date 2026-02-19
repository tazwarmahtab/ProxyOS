# ProxyOS Deployment Guide - HuggingFace Spaces

**Quickest deployment option** - Deploy in 10 minutes with no server management.

## Why HuggingFace Spaces?

| Feature | HuggingFace Spaces | Oracle ARM |
|---------|-------------------|------------|
| **RAM** | 16 GB (shared) | 12-24 GB |
| **Availability** | ✅ Always available | ❌ Capacity limits |
| **Setup Time** | ~10 minutes | ~45 minutes |
| **Cold Starts** | ⚠️ After 48h inactivity | ❌ None |
| **Cost** | Free | Free |
| **Control** | Limited | Full root |

## Prerequisites

- [HuggingFace account](https://huggingface.co) (free)
- [GitHub account](https://github.com) (for repo hosting)
- Supabase project set up (see below)
- API keys: Groq, (optional) Gemini

---

## Step 1: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for project to provision (~2 minutes)
3. Go to **SQL Editor** and run the contents of `infra/supabase-schema.sql`
4. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** → `SUPABASE_SERVICE_KEY`
5. Go to **Database → Replication** and ensure Realtime is enabled for:
   - `agent_tasks`
   - `proxy_context`
   - `proxy_stats`
   - `outbound_deliveries`

---

## Step 2: Prepare Your Repository

### Option A: Upload to HuggingFace Directly

1. Go to [huggingface.co/new-space](https://huggingface.co/new-space)
2. Fill in:
   - **Space name**: `proxyos-backend`
   - **SDK**: Select **Docker**
   - **Visibility**: Public or Private
3. Click **Create Space**

Then upload files:

**Required files to upload:**

```
apps/backend/
├── Dockerfile
├── package.json
├── server.js
├── agents/
│   ├── minion/
│   │   ├── soul.md
│   │   └── memory.md
│   ├── scout/
│   │   ├── soul.md
│   │   └── memory.md
│   └── sage/
│       ├── soul.md
│       └── memory.md
└── adapters/
    ├── telegram.js
    └── slack.js
```

Or use the `README HF.md` file (rename to `README.md` when uploading).

### Option B: Link to GitHub (Recommended)

1. Push your ProxyOS repo to GitHub
2. Go to [huggingface.co/new-space](https://huggingface.co/new-space)
3. Select **"Link to GitHub repository"**
4. Select your repo and set **Root directory** to `apps/backend`
5. Click **Create Space**

---

## Step 3: Configure Environment Variables

1. Go to your Space → **Settings** → **Variables and secrets**
2. Add the following:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `your-service-role-key` |
| `GROQ_API_KEY` | `your-groq-key` |
| `GEMINI_API_KEY` | `your-gemini-key` (optional) |
| `NODE_ENV` | `production` |

3. Click **Save**

---

## Step 4: Verify Deployment

1. Wait for the Space to build (~2-3 minutes)
2. Check the **Logs** tab for errors
3. Go to your Space URL: `https://YOUR-USERNAME-proxyos-backend.hf.space`
4. You should see:
   ```json
   {
     "status": "ProxyOS Swarm Online",
     "agents": ["minion", "scout", "sage"],
     "timestamp": "..."
   }
   ```

5. Test the health endpoint:
   ```bash
   curl https://YOUR-USERNAME-proxyos-backend.hf.space/health
   ```

---

## Step 5: Connect Your Frontend

In your Vercel frontend, set:

```
NEXT_PUBLIC_BACKEND_URL=https://YOUR-USERNAME-proxyos-backend.hf.space
```

---

## Step 6: Test End-to-End

1. Visit your Vercel frontend
2. Type a message in the Command Center
3. Check Supabase `agent_tasks` table for new tasks
4. Watch tasks process in the Swarm Drawer

---

## Messaging Adapters on HuggingFace

The backend runs on HuggingFace, but **adapters (Telegram/Slack) need special handling**:

### Option A: Run Adapters Locally

1. Set `PROXYOS_BACKEND_URL` to your HF Space URL
2. Run adapters locally:
   ```bash
   cd apps/backend
   npm install
   npm run start:telegram
   ```

### Option B: Use Separate HuggingFace Spaces

Create a second Space just for the Telegram adapter:

1. Create new Space: `proxyos-telegram`
2. Create a custom Dockerfile:
   ```dockerfile
   FROM node:18-bullseye-slim
   WORKDIR /app
   COPY package.json ./
   RUN npm install --only=production
   COPY . .
   CMD ["node", "adapters/telegram.js"]
   ```
3. Set environment variables including `TELEGRAM_BOT_TOKEN`

### Option C: Wait for Oracle ARM

Once you get Oracle ARM capacity, move everything there for a unified deployment.

---

## Limitations

| Limitation | Impact |
|------------|--------|
| **Sleeps after 48h inactivity** | First request after sleep has ~10-30s cold start |
| **16 GB shared RAM** | Multiple concurrent requests may slow down |
| **No persistent storage** | Files are reset on restart (use Supabase instead) |
| **Rate limits** | 1000 requests/day on free tier |

---

## Troubleshooting

### Build Fails

1. Check the **Logs** tab
2. Verify `Dockerfile` syntax
3. Ensure all files are uploaded

### Container Crashes

1. Check **Logs** for error messages
2. Verify all required environment variables are set
3. Check Supabase connection

### Tasks Not Processing

1. Check `GROQ_API_KEY` is valid
2. Verify Supabase `agent_tasks` table exists
3. Check logs for LLM errors

### Cold Starts

This is normal on free tier. To reduce:
- Use a monitoring service to ping your Space every few hours
- Upgrade to HuggingFace Pro ($9/month) for no sleep

---

## Upgrading to Paid Tier

HuggingFace Pro ($9/month):
- No sleep
- Better GPU options
- Custom domains
- Priority support

---

## Next Steps

1. ✅ Deploy backend on HuggingFace
2. ✅ Connect frontend on Vercel
3. ⬜ Set up Telegram/Slack adapters (locally or separate Spaces)
4. ⬜ Keep checking Oracle ARM capacity for migration
