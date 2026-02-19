# ProxyOS Deployment Guide

This guide walks you through deploying ProxyOS end-to-end on free-tier infrastructure.

## Prerequisites

- GitHub account
- Supabase account (free tier)
- Hugging Face account (free tier)
- Vercel account (free tier)
- API keys:
  - Groq API key (free tier)
  - Google Gemini API key (free tier)

## Step 1: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the contents of `infra/supabase-schema.sql`
3. Go to Project Settings > API and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_KEY` (backend only)

4. Enable Realtime:
   - Go to Database > Replication
   - Enable replication for tables: `agent_tasks`, `proxy_stats`, `user_preferences`

## Step 2: Set Up Hugging Face Backend

1. Go to [huggingface.co](https://huggingface.co) and create a Space
2. Choose:
   - SDK: Docker
   - Visibility: Public
3. Push the backend code:
   ```bash
   cd apps/backend
   git init
   git remote add origin https://huggingface.co/spaces/YOUR_USERNAME/proxyos-swarm
   git add .
   git commit -m "Initial backend"
   git push origin main
   ```
4. In Space Settings > Variables, add:
   - `SUPABASE_URL` (from Step 1)
   - `SUPABASE_SERVICE_KEY` (from Step 1)
   - `GROQ_API_KEY` (from groq.com)
   - `GEMINI_API_KEY` (from Google AI Studio)
5. Wait for the Space to build (usually 2-5 minutes)
6. Copy the Space URL → `NEXT_PUBLIC_BACKEND_URL`

## Step 3: Set Up Vercel Frontend

1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/ProxyOS.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) and import your GitHub repo
3. Configure:
   - Framework Preset: Next.js
   - Root Directory: `apps/web`
   - Build Command: `npm run build`
   - Output Directory: `.next`
4. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BACKEND_URL` (from Step 2)
   - `NEXT_PUBLIC_HF_TOKEN` (optional, for World Generator - get from HF Settings > Access Tokens)
5. Deploy!

## Step 4: Verify Deployment

1. **Backend Health Check**:
   - Visit `https://YOUR_SPACE.hf.space/health`
   - Should return `{"status":"healthy"}`

2. **Frontend**:
   - Visit your Vercel URL
   - Should see the ProxyOS dashboard
   - Try feeding context via Command Center
   - Check Swarm Drawer for task updates

3. **Database**:
   - In Supabase Dashboard, check `proxy_context` table for new entries
   - Check `agent_tasks` for delegated tasks

## Troubleshooting

### Backend not responding
- Check Hugging Face Space logs
- Verify all environment variables are set
- Ensure Dockerfile builds successfully

### Frontend can't connect to backend
- Verify `NEXT_PUBLIC_BACKEND_URL` is correct
- Check CORS settings (backend should allow your Vercel domain)
- Check browser console for errors

### Realtime not working
- Verify Realtime is enabled in Supabase
- Check that tables are published for replication
- Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct

### World Generator not working
- Ensure `NEXT_PUBLIC_HF_TOKEN` is set
- Check Hugging Face Inference API quota
- Verify the model name is correct in `concept.ts`

## Free Tier Limits

- **Supabase**: 500MB database, 2GB bandwidth/month
- **Hugging Face Spaces**: CPU-only, 16GB RAM, auto-sleep after inactivity
- **Vercel**: 100GB bandwidth/month, unlimited requests
- **Groq**: Check current free tier limits
- **Gemini**: Check current free tier limits

## Next Steps

- Add custom pixel art assets to `apps/web/public/skins/`
- Configure custom domain in Vercel
- Set up monitoring/analytics (optional)
- Add authentication if needed (Supabase Auth)
