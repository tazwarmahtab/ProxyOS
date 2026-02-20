# Railway Deployment Guide for ProxyOS Gateway

This guide covers deploying the ProxyOS Gateway to Railway's free tier for 24/7 cloud hosting.

## 🚀 Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

## 🚀 Step 2: Deploy Gateway

```bash
cd /Users/tazwarmahtab/ProxyOS

# Initialize Railway project
railway init
# Select "Create new Project"
# Project name: proxyos-gateway

# Deploy
railway up
```

## 🚀 Step 3: Set Environment Variables

In Railway Dashboard → Your Project → Settings → Variables

```
# Required: ProxyOS Backend
PROXYOS_BACKEND_URL=https://taz7770-proxyos-backend.hf.space
PROXYOS_OPENCLAW_URL=https://taz7770-proxyos-openclaw.hf.space
PROXYOS_API_KEY=getthehellouttahere

# LLM Providers (get from respective providers)
BONSAI_API_KEY=your_bonsai_api_key
NVIDIA_API_KEY=your_nvidia_api_key
GROQ_API_KEY=your_groq_api_key

# Database (get from Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Telegram (optional, for direct webhook)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ENABLED=false
```

## 🚀 Step 4: Get your Railway URL

```bash
railway domain
```

## 🚀 Step 5: Test the Gateway

After deployment, test it:

```bash
# Replace with your Railway domain
GATEWAY_URL="https://your-railway-domain.up.railway.app"

# Health check
curl -H "X-API-Key: getthehellouttahere" "$GATEWAY_URL/health"

# Backend API
curl -H "X-API-Key: getthehellouttahere" "$GATEWAY_URL/api/health"
```

## 🚀 Step 6: Connect OpenClaw App

In your Mac OpenClaw app, set:
- **Gateway URL**: `https://your-railway-domain.up.railway.app`
- **API Key**: `getthehellouttahere`

## 🚀 Step 7: (Optional) Set Custom Domain

In Railway Dashboard:
1. Go to Settings → Domains
2. Add your custom domain or use a Railway subdomain

## 🎯 Architecture After Deployment

```
Mac OpenClaw App → Railway Gateway → HuggingFace Spaces
                          ↓
            ┌──────────┴──────────┐
            ↓                      ↓
   proxyos-backend (API)     proxyos-openclaw (OpenClaw)
```

## 📊 Railway Free Tier Limits

| Resource | Limit |
|----------|-------|
| CPU Hours | 500/hr/month |
| RAM | 1GB |
| Storage | 10GB |
| Bandwidth | 100GB/month |
| Projects | Unlimited |

## 🔧 Troubleshooting

### Common Issues:

1. **"API key required" error**:
   - Make sure you're adding the `X-API-Key` header
   - Check that `PROXYOS_API_KEY` is set in Railway variables

2. **504 Gateway Timeout**:
   - Check that HF Spaces are running
   - Wait 2-3 minutes for HF Space to wake up

3. **404 Not Found**:
   - Rebuild your HF Spaces with the new code
   - Check HF Space status at https://huggingface.co/spaces/Taz7770/proxyos-backend

### View Logs:
```bash
railway logs
```

### Restart Deployment:
```bash
railway restart
```

## 📁 Project Structure

```
/Users/tazwarmahtab/ProxyOS/
├── railway-gateway.js       # Railway-optimized gateway
├── railway.json            # Railway config
├── docs/
│   └── RAILWAY_DEPLOYMENT.md # This file
└── ...
```

## 🎉 Success!

Your ProxyOS Gateway is now running on Railway's free tier! It will stay online 24/7 without needing your Mac to be running.
