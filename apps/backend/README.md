# ProxyOS Backend

Express.js backend for ProxyOS agent swarm, designed to run on **Oracle Cloud Free Tier** (recommended) or Hugging Face Spaces.

## Quick Start

### Using Docker Compose (Recommended for Oracle Cloud)

```bash
# Copy environment template
cp .env.example .env
# Edit .env with your actual keys

# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Using Docker directly

```bash
# Copy environment template
cp .env.example .env
# Edit .env with your actual keys

# Build the image
docker build -t proxyos-backend .

# Run the container
docker run -d \
  --name proxyos-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  proxyos-backend

# View logs
docker logs -f proxyos-backend
```

### Using Node.js directly (for development)

```bash
npm install
cp .env.example .env
# Edit .env with your actual keys
npm start
```

## Environment Variables

See `.env.example` for required variables:

- `PORT` - Server port (default: 3000 for Oracle Cloud, 7860 for HF Spaces)
- `NODE_ENV` - Environment (production/development)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (backend only)
- `GROQ_API_KEY` - Groq API key for LLM
- `GEMINI_API_KEY` - Google Gemini API key for LLM

## API Endpoints

- `GET /` - Status and agent list
- `GET /health` - Health check endpoint
- `POST /api/feed-context` - Feed context and auto-delegate to agents
- `GET /api/swarm-status` - Get current swarm status and tasks
- `POST /api/assign-task` - Manually assign a task to an agent
- `POST /api/halt-task/:id` - Halt a running task
- `GET /api/memories/:agentRole` - Get agent memory (proxy/minion/scout/sage)

## Deployment

### Oracle Cloud (Recommended)

See `../../docs/DEPLOYMENT_ORACLE.md` for complete Oracle Cloud setup guide.

**Quick steps:**
1. Create Oracle Cloud VM (ARM Ampere A1, 2 OCPU, 12GB RAM)
2. Install Docker and Docker Compose
3. Clone repo and set `PORT=3000` in `.env`
4. Run `docker-compose up -d`

### Hugging Face Spaces

See `../../docs/DEPLOYMENT.md` for Hugging Face Spaces setup.

**Note**: Hugging Face Spaces auto-sleeps after inactivity, causing cold starts. Oracle Cloud is recommended for production.

## Architecture

- **Express.js** server with REST API
- **Agent Swarm**: Minion (code), Scout (research), Sage (strategy)
- **Task Queue**: Processes tasks every 10 seconds via cron
- **Memory Sync**: Syncs agent memories from Supabase on boot
- **LLM Routing**: Uses Groq (fast) or Gemini (deep reasoning) based on task type

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# The server will restart automatically on file changes
```

## Health Check

The backend includes a health check endpoint:

```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Logs

View logs:
```bash
# Docker Compose
docker-compose logs -f

# Docker
docker logs -f proxyos-backend

# PM2 (if using)
pm2 logs proxyos-backend
```

## Troubleshooting

### Container won't start
- Check `.env` file exists and has all required variables
- Verify port 3000 is not already in use
- Check logs: `docker-compose logs proxyos-backend`

### Tasks not processing
- Verify LLM API keys are valid
- Check Supabase connection
- Review agent logs in Supabase `execution_logs` table

### High memory usage
- Monitor with `docker stats`
- Check for memory leaks in logs
- Consider reducing concurrent tasks

## License

Private - See root LICENSE file
