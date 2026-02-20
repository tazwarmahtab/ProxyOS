/**
 * ProxyOS Local Gateway Server
 * 
 * Acts as a proxy between local Mac OpenClaw app and HuggingFace Spaces backend.
 * Handles API key authentication and CORS for local development.
 * 
 * Usage: node proxyos-gateway.js
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// Load environment variables
dotenv.config({ path: '.env.proxyos' });

const app = express();
const PORT = process.env.PORT || 7860;

// Configuration
const BACKEND_URL = process.env.PROXYOS_BACKEND_URL || 'https://taz7770-proxyos-backend.hf.space';
const OPENCLOUD_URL = process.env.PROXYOS_OPENCLAW_URL || 'https://taz7770-proxyos-openclaw.hf.space';
const API_KEY = process.env.PROXYOS_API_KEY || '';

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key', 'Accept'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[ProxyOS Gateway] ${timestamp} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    gateway: 'ProxyOS Local Gateway',
    version: '1.0.0',
    upstream: {
      backend: BACKEND_URL,
      openclaw: OPENCLOUD_URL
    }
  });
});

// API key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (API_KEY && !apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  if (API_KEY && apiKey !== API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Proxy request function using native Node.js
const proxyRequest = (req, res, targetUrl) => {
  const url = new URL(req.url, targetUrl);
  
  const options = {
    hostname: url.hostname,
    port: url.port || (targetUrl.startsWith('https') ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.hostname,
      // Forward API key if configured
      ...(API_KEY && { 'X-API-Key': API_KEY })
    }
  };

  // Remove headers that shouldn't be forwarded
  delete options.headers['accept-encoding'];
  delete options.headers['content-length'];
  
  const protocol = targetUrl.startsWith('https') ? https : http;
  
  const proxyReq = protocol.request(options, (proxyRes) => {
    // Handle redirect
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      res.redirect(proxyRes.statusCode, proxyRes.headers.location);
      return;
    }
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    
    // Forward status
    res.status(proxyRes.statusCode);
    
    // Forward headers (except encoding)
    Object.keys(proxyRes.headers).forEach(key => {
      if (key !== 'content-encoding') {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });
    
    // Pipe the response
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[ProxyOS Gateway] Proxy error: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'Bad Gateway',
        message: 'Failed to connect to upstream server',
        details: err.message
      });
    }
  });

  // Pipe the request body
  req.pipe(proxyReq);
};

// API routes proxy - forwards to HF backend Space
app.use('/api', validateApiKey, (req, res) => {
  proxyRequest(req, res, BACKEND_URL);
});

// OpenClaw proxy - forwards to HF OpenClaw Space
app.use('/openclaw', validateApiKey, (req, res) => {
  const openclawPath = req.url.replace(/^\/openclaw/, '') || '/';
  const tempReq = {
    ...req,
    url: openclawPath + (req.url.includes('?') ? req.url.split('?')[1] : '')
  };
  proxyRequest(tempReq, res, OPENCLOUD_URL);
});

// Root proxy - catch all for other endpoints
app.use('/', (req, res) => {
  proxyRequest(req, res, BACKEND_URL);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path,
    message: 'The requested endpoint does not exist'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ProxyOS Gateway] Error: ${err.message}`);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         ProxyOS Local Gateway - Started Successfully       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Local URL:    http://localhost:${PORT}                      ║`);
  console.log(`║  Backend:      ${BACKEND_URL.substring(0, 42)}  ║`);
  console.log(`║  OpenClaw:     ${OPENCLOUD_URL.substring(0, 42)}  ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                             ║');
  console.log('║    GET  /health          - Health check                  ║');
  console.log('║    POST /api/*           - Proxy to backend API          ║');
  console.log('║    GET  /openclaw/*      - Proxy to OpenClaw Space       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

export default app;
