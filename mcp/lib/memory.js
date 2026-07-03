// Mnemox MCP - Memory API Client
// HTTP client for the Mnemox FastAPI backend (Railway or localhost).
// Uses Node built-in https/http — zero external dependencies.

'use strict';

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const BASE_URL = process.env.MNEMOX_API_URL || 'https://mnemox-production.up.railway.app';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function saveMemory({ content, source, user_id, trust_score }) {
  const res = await request('POST', '/memories', { content, source, user_id, trust_score });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`saveMemory failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function getMemories({ user_id, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (user_id) params.set('user_id', user_id);
  params.set('limit', String(limit));
  const res = await request('GET', `/memories?${params}`);
  if (res.status !== 200) {
    throw new Error(`getMemories failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function searchMemories({ query, user_id, limit = 10 }) {
  const res = await request('POST', '/search', { query, user_id, limit });
  if (res.status !== 200) {
    throw new Error(`searchMemories failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function healthCheck() {
  const res = await request('GET', '/health');
  return res.body;
}

module.exports = { saveMemory, getMemories, searchMemories, healthCheck };
