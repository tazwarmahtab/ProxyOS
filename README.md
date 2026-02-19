ProxyOS – Gamified AI Office Swarm
==================================

ProxyOS is a mobile‑first, Apple‑grade web app that lets you feed real‑world context to a personal “Proxy” avatar and watch a swarm of AI agents execute work inside a pixel / isometric office.

This repo is structured as a small monorepo:

- `apps/web` – Next.js frontend (PWA) with:
  - Command Center (context feed with text + voice)
  - 2D pixel office (Phaser)
  - Swarm Activity drawer
  - Memory Vault (agent long‑term memory)
  - World Generator (AI‑generated offices with Three.js)
- `apps/backend` – Node/Express backend designed for **Oracle Cloud Free Tier** (recommended):
  - Receives context from the frontend
  - Delegates tasks to agents (Minion, Scout, Sage)
  - Persists context, tasks, and memories in Supabase
  - Always-on, production-ready infrastructure
- `infra` – Supabase schema, migrations, and infra notes
- `docs` – architecture and deployment docs
- `packages/shared` – shared TypeScript types and utilities

## Environment variables

Copy `.env.example` to the appropriate locations for local development:

- Root `.env.example` lists **all** variables used across apps.
- You will later create:
  - `apps/web/.env.local` for the frontend (public keys only)
  - `apps/backend/.env` for the Oracle Cloud backend (service + LLM keys)

## High‑level stack

- Frontend: Next.js (App Router, TypeScript), Tailwind CSS, Phaser, Three.js, Supabase client
- Backend: Node 18, Express, Supabase client, Groq (Llama 3) + Gemini
- Database: Supabase Postgres + Realtime
- Hosting (all free tier):
  - **Vercel** – `apps/web` (frontend)
  - **Oracle Cloud Free Tier** – `apps/backend` (recommended: always-on, 24GB RAM)
  - **Supabase** – database + storage

## Documentation

- 📘 **[Oracle Cloud Deployment Guide](docs/DEPLOYMENT_ORACLE.md)** - Deploy backend to Oracle Cloud
- 📗 [Hugging Face Spaces Guide](docs/DEPLOYMENT.md) - Alternative deployment (has auto-sleep limitations)
- 🔗 **[Openclaw Integration Plan](docs/OPENCLAW_INTEGRATION_PLAN.md)** - Complete plan for messaging app integration
- 📚 **[Context for Continuation](docs/CONTEXT_FOR_CONTINUATION.md)** - Full context for continuing development
- ⚡ [Quick Reference](docs/QUICK_REFERENCE.md) - Quick lookup during implementation

### Quick Start

1. Set up Supabase (database)
2. Create Oracle Cloud VM (ARM Ampere A1, 2 OCPU, 12GB RAM)
3. Deploy backend with Docker Compose
4. Deploy frontend to Vercel

See `docs/DEPLOYMENT_ORACLE.md` for detailed step-by-step instructions.

## Why Oracle Cloud?

✅ **Always-on** - No auto-sleep, instant task processing  
✅ **More resources** - 24GB RAM vs 16GB on alternatives  
✅ **Production-ready** - Suitable for real workloads  
✅ **Free forever** - Generous free tier  

See `docs/ARCHITECTURE.md` (to be added) and the Kimi/ProxyOS product doc for the full vision.

