/**
 * Claude Power UI — AI Proxy Function (Netlify Functions v1 / CommonJS)
 * ─────────────────────────────────────────────────────────────────────
 * Routes all AI provider calls through this serverless function to
 * avoid browser CORS restrictions on production deployments.
 *
 * BYOK proxy: the user's API key is forwarded per-request over HTTPS.
 * Keys are never stored — only relayed in-flight.
 *
 * Supports: Anthropic, OpenAI, Groq, Mistral, Google Gemini
 *
 * URL: /.netlify/functions/proxy
 * Method: POST
 * Body: { provider, path, apiKey, payload, queryParams? }
 *
 * Note: Uses CommonJS exports.handler (v1) for maximum compatibility
 * with Netlify zip deploys. Streaming is handled by chunked buffering.
 */

'use strict';

const PROVIDER_BASE = {
  anthropic: 'https://api.anthropic.com',
  openai:    'https://api.openai.com',
  groq:      'https://api.groq.com/openai',
  mistral:   'https://api.mistral.ai',
  google:    'https://generativelanguage.googleapis.com',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function response(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

async function fetchProvider(url, upstreamHeaders, payload) {
  // Use Node's built-in https module (always available in Lambda/Netlify runtime)
  return new Promise((resolve, reject) => {
    const https   = require('https');
    const http    = require('http');
    const urlMod  = require('url');

    const parsed  = urlMod.parse(url);
    const isHttps = parsed.protocol === 'https:';
    const client  = isHttps ? https : http;
    const bodyStr = JSON.stringify(payload);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.path,
      method:   'POST',
      headers:  {
        ...upstreamHeaders,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const chunks = [];
    const req = client.request(options, (res) => {
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end',  () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });

    req.on('error', reject);
    req.setTimeout(29000, () => { req.destroy(); reject(new Error('Upstream timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

exports.handler = async function(event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  // Parse body
  let req;
  try {
    req = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid JSON' });
  }

  const { provider, path: apiPath, apiKey, payload, queryParams } = req;

  if (!provider || !apiPath || !payload) {
    return response(400, { error: 'Missing: provider, path, payload' });
  }

  const base = PROVIDER_BASE[provider];
  if (!base) {
    return response(400, { error: `Unknown provider: ${provider}` });
  }

  // Build upstream URL
  let url = base + apiPath;
  if (queryParams && Object.keys(queryParams).length) {
    const qs = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    url += '?' + qs;
  }

  // Build upstream headers
  const upstreamHeaders = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    upstreamHeaders['x-api-key']         = apiKey || '';
    upstreamHeaders['anthropic-version'] = '2023-06-01';
  } else if (provider !== 'google') {
    // openai, groq, mistral — Bearer token
    upstreamHeaders['Authorization'] = `Bearer ${apiKey || ''}`;
    // Google uses ?key= query param set in queryParams above
  }

  // Forward request
  let upstream;
  try {
    upstream = await fetchProvider(url, upstreamHeaders, payload);
  } catch (e) {
    return response(502, { error: `Upstream error: ${e.message}` });
  }

  // Return response — preserving SSE content as-is
  const contentType = upstream.headers['content-type'] || 'application/json';
  return {
    statusCode: upstream.status,
    headers: {
      ...CORS,
      'Content-Type':  contentType,
      'Cache-Control': 'no-cache',
    },
    body: upstream.body,
  };
};
