/**
 * Async — AI Proxy Function (Netlify Functions v1 / CommonJS)
 * ─────────────────────────────────────────────────────────────────────
 * Routes all AI provider calls through this serverless function to
 * avoid browser CORS restrictions on production deployments.
 *
 * subscription proxy: the user's API key is forwarded per-request over HTTPS.
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
  // Image generation providers
  bfl:          'https://api.bfl.ml',
  fal:          'https://fal.run',
  replicate:    'https://api.replicate.com',
  huggingface:  'https://api-inference.huggingface.co',
  // Web search
  ddg:       'https://api.duckduckgo.com',
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

async function fetchProvider(url, upstreamHeaders, payload, method = 'POST') {
  // Use Node's built-in https module (always available in Lambda/Netlify runtime)
  return new Promise((resolve, reject) => {
    const https   = require('https');
    const http    = require('http');
    const urlMod  = require('url');

    const parsed   = urlMod.parse(url);
    const isHttps  = parsed.protocol === 'https:';
    const client   = isHttps ? https : http;
    const hasBody  = method !== 'GET' && payload !== undefined;
    const bodyStr  = hasBody ? JSON.stringify(payload) : null;
    const headers  = { ...upstreamHeaders };
    if (hasBody) {
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    } else {
      delete headers['Content-Type'];
    }

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.path,
      method,
      headers,
    };

    const chunks = [];
    const req = client.request(options, (res) => {
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end',  () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('latin1'), headers: res.headers }));
    });

    req.on('error', reject);
    req.setTimeout(29000, () => { req.destroy(); reject(new Error('Upstream timeout')); });
    if (hasBody) req.write(bodyStr);
    req.end();
  });
}

// This function is meant to be called only by this app's own browser JS
// (it exists purely to dodge browser CORS — see file header). It has no
// other authentication, so it's otherwise an open relay: anyone who finds
// the URL could use it to send arbitrary-but-attacker-supplied API keys to
// any of PROVIDER_BASE's hosts. A real same-origin browser POST always
// carries an Origin header matching the request's own Host (the Fetch
// standard sends Origin on POST regardless of same/cross-origin, for
// exactly this kind of server-side check) — reject anything else that
// *does* present an Origin. Requests with no Origin at all (curl, server-
// to-server, older clients) are still let through unchanged from before,
// so this doesn't require new configuration or break existing deploys.
function isAllowedOrigin(event) {
  const headers = event.headers || {};
  const origin  = headers.origin || headers.Origin;
  const host    = headers.host   || headers.Host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

exports.handler = async function(event) {
  const startedAt = Date.now();
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(event)) {
    console.warn(JSON.stringify({ fn: 'proxy', event: 'origin_rejected', origin: event.headers?.origin, host: event.headers?.host }));
    return response(403, { error: 'Forbidden' });
  }

  // Parse body
  let req;
  try {
    req = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid JSON' });
  }

  const { provider, path: apiPath, apiKey, payload, queryParams, method } = req;
  const upstreamMethod = (method || 'POST').toUpperCase();

  // Structured, single-line JSON logs — queryable in the Netlify Functions
  // log viewer/CLI. Never logs apiKey or payload contents (subscription keys must
  // never end up in logs), only routing metadata needed to see which
  // provider/endpoint is failing or slow in production.
  const log = (fields) => console.log(JSON.stringify({ fn: 'proxy', provider, path: apiPath, method: upstreamMethod, ...fields }));

  if (!provider || !apiPath) {
    return response(400, { error: 'Missing: provider, path' });
  }
  if (upstreamMethod !== 'GET' && !payload) {
    return response(400, { error: 'Missing: payload' });
  }

  const base = PROVIDER_BASE[provider];
  if (!base) {
    log({ event: 'unknown_provider' });
    return response(400, { error: `Unknown provider: ${provider}` });
  }

  // ── DuckDuckGo instant answers (GET, no auth) ────────────
  if (provider === 'ddg') {
    const https = require('https');
    const q     = encodeURIComponent((payload.query || '').slice(0, 200));
    const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&t=claudepowerui`;
    return new Promise((resolve) => {
      https.get(ddgUrl, { headers: { 'User-Agent': 'ClaudePowerUI/2' } }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          log({ event: 'upstream_response', status: res.statusCode, durationMs: Date.now() - startedAt });
          resolve({
            statusCode: res.statusCode,
            headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }).on('error', (e) => {
        log({ event: 'upstream_error', error: e.message, durationMs: Date.now() - startedAt });
        resolve(response(502, { error: e.message }));
      });
    });
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
  } else if (provider === 'bfl') {
    upstreamHeaders['x-key'] = apiKey || '';
  } else if (provider === 'fal') {
    upstreamHeaders['Authorization'] = `Key ${apiKey || ''}`;
  } else if (provider === 'replicate') {
    upstreamHeaders['Authorization'] = `Token ${apiKey || ''}`;
  } else if (provider === 'huggingface') {
    upstreamHeaders['Authorization'] = `Bearer ${apiKey || ''}`;
  } else if (provider !== 'google') {
    // openai, groq, mistral — Bearer token
    upstreamHeaders['Authorization'] = `Bearer ${apiKey || ''}`;
    // Google uses ?key= query param set in queryParams above
  }

  // Forward request
  let upstream;
  try {
    upstream = await fetchProvider(url, upstreamHeaders, payload, upstreamMethod);
  } catch (e) {
    log({ event: 'upstream_error', error: e.message, durationMs: Date.now() - startedAt });
    return response(502, { error: `Upstream error: ${e.message}` });
  }

  log({ event: 'upstream_response', status: upstream.status, durationMs: Date.now() - startedAt });

  const contentType = upstream.headers['content-type'] || 'application/json';

  // HuggingFace Inference API (and some other image providers) return raw binary
  // image bytes. The fetch() body is accumulated as a Buffer, so we can safely
  // base64-encode it and wrap in a small JSON envelope that the client can turn
  // into a data URL without going through a separate URL fetch.
  const isImageResponse = contentType.startsWith('image/');
  if (isImageResponse && upstream.status === 200) {
    // upstream.body was collected via Buffer.concat().toString('utf8') which
    // corrupts binary data.  We need the raw buffer — re-fetch synchronously.
    // Since we already have the body string, use a workaround: re-encode via
    // latin1 (which is a 1:1 byte mapping) so we can recover the raw bytes.
    const rawBuffer = Buffer.from(upstream.body, 'latin1');
    const b64 = rawBuffer.toString('base64');
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ base64: b64, contentType }),
    };
  }

  // Return response — preserving SSE content as-is
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
