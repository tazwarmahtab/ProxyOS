# ProxyOS Local Gateway

Quick setup guide for connecting your local Mac OpenClaw app to HuggingFace Spaces backend.

## Overview

This gateway runs locally on your Mac and acts as a proxy between your OpenClaw app and the HuggingFace Spaces backend. It handles:
- Request forwarding to HF Spaces
- API key authentication
- CORS for local development
- All existing API endpoints

## Files Created

| File | Description |
|------|-------------|
| [`proxyos-gateway.js`](proxyos-gateway.js) | Main gateway server |
| [`.env.proxyos`](.env.proxyos) | Environment configuration |
| [`start-gateway.sh`](start-gateway.sh) | Startup script |

## Quick Start

### 1. Configure Environment

Edit `.env.proxyos` and set your actual API keys:

```bash
# Required: HuggingFace Spaces URLs
PROXYOS_BACKEND_URL=https://taz7770-proxyos-backend.hf.space
PROXYOS_OPENCLAW_URL=https://taz7770-proxyos-openclaw.hf.space

# Optional: API key for authentication
PROXYOS_API_KEY=your_secret_key

# Required: At least one LLM provider
NVIDIA_API_KEY=your_nvidia_key
# OR
GROQ_API_KEY=your_groq_key
# OR
BONSAI_API_KEY=your_bonsai_key
```

### 2. Make Script Executable

```bash
chmod +x start-gateway.sh
```

### 3. Start Gateway

```bash
# Using the startup script
./start-gateway.sh

# Or directly with node
node proxyos-gateway.js
```

The gateway will start on `http://localhost:7860`

### 4. Update OpenClaw Configuration

In your local OpenClaw app, change the backend URL from:
```
http://localhost:3000
```
to:
```
http://localhost:7860
```

## Testing

### Health Check

```bash
curl http://localhost:7860/health
```

Expected response:
```json
{
  "status": "ok",
  "gateway": "ProxyOS Local Gateway",
  "version": "1.0.0",
  "upstream": {
    "backend": "https://taz7770-proxyos-backend.hf.space",
    "openclaw": "https://taz7770-proxyos-openclaw.hf.space"
  }
}
```

### Test Backend API

```bash
curl http://localhost:7860/api/health
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Gateway health check |
| `POST /api/*` | Proxy to backend API |
| `GET /openclaw/*` | Proxy to OpenClaw Space |

## Authentication

If you set `PROXYOS_API_KEY` in `.env.proxyos`, include it in requests:

```bash
curl -H "X-API-Key: your_secret_key" http://localhost:7860/api/your-endpoint
```

## Troubleshooting

### Connection Refused
- Make sure the gateway is running
- Check if port 7860 is available

### 502 Bad Gateway
- Verify HF Space URLs are correct in `.env.proxyos`
- Check your internet connection
- Ensure HF Spaces are deployed and running

### CORS Errors
- The gateway adds CORS headers automatically
- If issues persist, check browser console for details

## Stopping the Gateway

```bash
# Find the process
ps aux | grep proxyos-gateway

# Kill it
kill <PID>
```

## Notes

- The gateway runs on port 7860 by default (same as the backend)
- All requests are forwarded to HF Spaces over HTTPS
- API keys are forwarded to upstream servers for authentication
