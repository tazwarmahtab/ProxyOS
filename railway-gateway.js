#!/usr/bin/env node

/**
 * ProxyOS Railway Gateway
 *
 * This gateway connects your Mac OpenClaw app to HuggingFace Spaces.
 * Deploy this to Railway for cloud hosting.
 *
 * Usage:
 *   railway up
 *   railway logs
 *
 * Environment Variables (set in Railway dashboard):
 *   PORT - Railway will set this automatically
 *   PROXYOS_BACKEND_URL - Your HF backend Space URL
 *   PROXYOS_OPENCLAW_URL - Your HF OpenClaw Space URL
 *   PROXYOS_API_KEY - Authentication key
 *   BONSAI_API_KEY, NVIDIA_API_KEY, GROQ_API_KEY, etc.
 */

import express from 'express';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config({ path: '.env.proxyos' });

const app = express();
app.use(express.json());

// Get config from environment or fallback to Railway vars
const PORT = process.env.PORT || 18789;
const PROXYOS_BACKEND_URL = process.env.PROXYOS_BACKEND_URL || process.env.BACKEND_URL || 'https://taz7770-proxyos-backend.hf.space';
const PROXYOS_OPENCLAW_URL = process.env.PROXYOS_OPENCLAW_URL || process.env.OPENCLAW_URL || 'https://taz7770-proxyos-openclaw.hf.space';
const PROXYOS_API_KEY = process.env.PROXYOS_API_KEY || 'getthehellouttahere';

// --- Simple in-memory rate limiter ---
const rateLimitWindow = 60 * 1000; // 1 minute
const rateLimitMax = 60; // requests per window
const rateLimitStore = new Map();

function rateLimit(req, res, next) {
  const key = req.headers['x-api-key'] || req.ip;
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + rateLimitWindow };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  if (entry.count > rateLimitMax) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }

  next();
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

// --- Request logging ---
function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    console.log(`[Gateway] ${method} ${originalUrl} -> ${res.statusCode} (${elapsed}ms)`);
  });

  next();
}

app.use(requestLogger);

// Logging
console.log(`
╔════════════════════════════════════════════════════════════╗
║         ProxyOS Railway Gateway - Starting                 ║
╠════════════════════════════════════════════════════════════╣
║  Port:      ${PORT}
║  Backend:   ${PROXYOS_BACKEND_URL}
║  OpenClaw:  ${PROXYOS_OPENCLAW_URL}
╚════════════════════════════════════════════════════════════╝
`);

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    gateway: 'ProxyOS Railway Gateway',
    version: '1.1.0',
    upstream: {
      backend: PROXYOS_BACKEND_URL,
      openclaw: PROXYOS_OPENCLAW_URL
    }
  });
});

// API key middleware
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (PROXYOS_API_KEY && apiKey !== PROXYOS_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// Apply API key + rate limiting to /api routes
app.use('/api', requireApiKey, rateLimit);
app.use('/api', createProxyMiddleware({
  target: PROXYOS_BACKEND_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '' }
}));

// OpenClaw proxy (now requires API key + rate limiting)
app.use('/openclaw', requireApiKey, rateLimit);
app.use('/openclaw', createProxyMiddleware({
  target: PROXYOS_OPENCLAW_URL,
  changeOrigin: true,
  pathRewrite: { '^/openclaw': '' }
}));

// Root redirect to health
app.get('/', (req, res) => {
  res.redirect('/health');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProxyOS Gateway running on port ${PORT}`);
  console.log(`Backend: ${PROXYOS_BACKEND_URL}`);
  console.log(`OpenClaw: ${PROXYOS_OPENCLAW_URL}`);
});
