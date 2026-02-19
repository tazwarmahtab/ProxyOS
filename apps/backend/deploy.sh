#!/bin/bash

set -e

echo "================================================"
echo "  ProxyOS Backend Deployment Script"
echo "================================================"
echo ""

BACKEND_URL="${PROXYOS_BACKEND_URL:-http://proxyos-backend:3000}"
export PROXYOS_BACKEND_URL

echo "[1/5] Pulling latest code..."
git pull origin main 2>/dev/null || echo "  Skipping git pull (not a git repo or no remote)"

echo ""
echo "[2/5] Building Docker images..."
docker-compose build

echo ""
echo "[3/5] Stopping existing containers..."
docker-compose down

echo ""
echo "[4/5] Starting containers..."
echo ""
echo "Select deployment mode:"
echo "  1) Backend only (no adapters)"
echo "  2) Backend + Telegram"
echo "  3) Backend + Slack"
echo "  4) Backend + Telegram + Slack"
echo "  5) All (backend + all adapters)"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
  1)
    docker-compose up -d proxyos-backend
    ;;
  2)
    docker-compose --profile telegram up -d
    ;;
  3)
    docker-compose --profile slack up -d
    ;;
  4)
    docker-compose --profile telegram --profile slack up -d
    ;;
  5)
    docker-compose --profile telegram --profile slack up -d
    ;;
  *)
    echo "Invalid choice. Starting backend only..."
    docker-compose up -d proxyos-backend
    ;;
esac

echo ""
echo "[5/5] Waiting for services to be healthy..."
sleep 5

echo ""
echo "================================================"
echo "  Deployment Complete!"
echo "================================================"
echo ""
echo "Running containers:"
docker-compose ps

echo ""
echo "Health check:"
curl -s http://localhost:3000/health 2>/dev/null || echo "  Backend not responding on port 3000"

echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To view specific service logs:"
echo "  docker-compose logs -f proxyos-backend"
echo "  docker-compose logs -f proxyos-telegram"
echo "  docker-compose logs -f proxyos-slack"
echo ""
