#!/bin/bash

# =============================================================================
# ProxyOS Gateway Startup Script
# 
# This script loads environment variables and starts the gateway server.
# Usage: ./start-gateway.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           ProxyOS Gateway - Startup Script                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env.proxyos exists
if [ ! -f ".env.proxyos" ]; then
    echo -e "${RED}Error: .env.proxyos file not found!${NC}"
    echo ""
    echo "Please create .env.proxyos from the template:"
    echo "  cp .env.proxyos.example .env.proxyos"
    echo ""
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}Loading environment variables from .env.proxyos...${NC}"
export $(cat .env.proxyos | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$PROXYOS_BACKEND_URL" ]; then
    echo -e "${RED}Error: PROXYOS_BACKEND_URL is not set!${NC}"
    exit 1
fi

if [ -z "$PROXYOS_OPENCLAW_URL" ]; then
    echo -e "${RED}Error: PROXYOS_OPENCLAW_URL is not set!${NC}"
    exit 1
fi

echo -e "${GREEN}Environment variables loaded successfully!${NC}"
echo ""
echo "Configuration:"
echo "  Backend URL:   $PROXYOS_BACKEND_URL"
echo "  OpenClaw URL:  $PROXYOS_OPENCLAW_URL"
echo "  API Key:       ${PROXYOS_API_KEY:+configured}"
echo "  Port:          ${PORT:-7860}"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed!${NC}"
    exit 1
fi

# Check if proxyos-gateway.js exists
if [ ! -f "proxyos-gateway.js" ]; then
    echo -e "${RED}Error: proxyos-gateway.js not found!${NC}"
    exit 1
fi

echo -e "${YELLOW}Starting ProxyOS Gateway...${NC}"
echo ""

# Start the gateway
node proxyos-gateway.js
