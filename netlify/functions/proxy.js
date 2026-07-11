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

const net = require('net');
const dnsPromises = require('dns').promises;

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
  huggingface:  'https://router.huggingface.co/hf-inference',
  // Web search providers
  ddg:          'https://api.duckduckgo.com',
  brave:        'https://api.search.brave.com',
  serpapi:      'https://serpapi.com',
  // Developer platforms
  github:       'https://api.github.com',
  // Super-Agent tools
  fetch_url:    '__DYNAMIC__',  // URL is provided in payload.url
  wikipedia:    'https://en.wikipedia.org',
};

// CORS headers are built per-request against the validated caller Origin —
// never '*'. This is a credentialed relay (it forwards the user's API key),
// so a wildcard ACAO would let any site read the responses.
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':      origin,
    'Access-Control-Allow-Methods':     'POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary':                             'Origin',
  };
}

function makeResponder(cors) {
  return function response(statusCode, body, extra = {}) {
    return {
      statusCode,
      headers: { ...cors, 'Content-Type': 'application/json', ...extra },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };
  };
}

// ── SSRF guards ───────────────────────────────────────────────────
// Reject any address that points back into the deployment's own network:
// RFC1918 private ranges, loopback, link-local (incl. the 169.254.169.254
// cloud metadata endpoint), and other non-public ranges.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;                              // 10/8
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16-31/12
    if (p[0] === 192 && p[1] === 168) return true;             // 192.168/16
    if (p[0] === 127) return true;                             // loopback
    if (p[0] === 169 && p[1] === 254) return true;             // link-local + metadata
    if (p[0] === 0) return true;                               // 0.0.0.0/8
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT 100.64/10
    if (p[0] >= 224) return true;                              // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;                // loopback / unspecified
    if (v.startsWith('fe80')) return true;                     // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique-local
    const mapped = v.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // unparseable → treat as unsafe
}

function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.internal')) return true;
  return false;
}

// Validate that a URL is https and does not resolve to a private/internal
// address. Throws Error on any violation. Returns the parsed URL.
async function assertPublicHttpsUrl(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'https:') throw new Error('Only https:// URLs are allowed');
  if (isBlockedHostname(u.hostname)) throw new Error('Host not allowed');

  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Target resolves to a private address');
  } else {
    let records;
    try {
      records = await dnsPromises.lookup(host, { all: true });
    } catch {
      throw new Error('DNS resolution failed');
    }
    if (!records.length) throw new Error('DNS resolution failed');
    for (const r of records) {
      if (isPrivateIp(r.address)) throw new Error('Target resolves to a private address');
    }
  }
  return u;
}

// GET a URL as a Buffer, manually following up to maxRedirects hops and
// re-validating every hop against assertPublicHttpsUrl (so a redirect to a
// private IP or non-https scheme is rejected). Node's http(s).get does not
// auto-follow redirects, which is exactly what we want here.
async function safeFetchBuffer(startUrl, { headers = {}, timeout = 20000, maxRedirects = 3 } = {}) {
  const https = require('https');
  let current = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpsUrl(current);
    const step = await new Promise((resolve, reject) => {
      const r = https.get(current, { headers, timeout }, (res) => {
        const status = res.statusCode;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // discard redirect body
          let next;
          try { next = new URL(res.headers.location, current).toString(); }
          catch { reject(new Error('Invalid redirect target')); return; }
          resolve({ redirect: next });
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status, buffer: Buffer.concat(chunks) }));
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('Request timed out')); });
    });
    if (step.redirect) { current = step.redirect; continue; }
    return step;
  }
  throw new Error('Too many redirects');
}

// Validate a caller-supplied API path can never change the upstream host.
function isSafeApiPath(apiPath) {
  return typeof apiPath === 'string'
    && apiPath.startsWith('/')
    && !apiPath.startsWith('//')
    && !apiPath.includes('..')
    && !apiPath.includes('@')
    && !apiPath.includes('\\')
    && !/[\s]/.test(apiPath);
}

// Return the validated caller Origin (scheme://host) or null. Requires a
// same-origin request: the Origin's host must equal the request Host (the
// Netlify site host). Absent/mismatched/unparseable Origin → null (rejected).
function resolveAllowedOrigin(event) {
  const headers = event.headers || {};
  const origin  = headers.origin || headers.Origin;
  const host    = headers.host   || headers.Host;
  if (!origin || !host) return null;
  try {
    const o = new URL(origin);
    if (o.host !== host) return null;
    return o.origin;
  } catch {
    return null;
  }
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
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Upstream timeout (25s)')); });
    if (hasBody) req.write(bodyStr);
    req.end();
  });
}

exports.handler = async function(event) {
  const startedAt = Date.now();

  // This is a credentialed relay (it forwards the user's API key upstream),
  // so it must only serve its own browser front-end. Require a same-origin
  // Origin header matching the request Host; reject when absent or mismatched
  // (curl / cross-site / server-to-server no longer get a free pass). The
  // validated Origin is echoed back in Access-Control-Allow-Origin — never '*'.
  const allowedOrigin = resolveAllowedOrigin(event);
  const cors = corsHeaders(allowedOrigin || 'null');
  const response = makeResponder(cors);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    if (!allowedOrigin) return { statusCode: 403, headers: cors, body: '' };
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  if (!allowedOrigin) {
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

  // ── fetch_url — proxy-CORS-bypass for KB URL ingestion ────────
  // SSRF-hardened: https-only, DNS-validated against private/internal ranges,
  // with redirect hops (max 3) re-validated the same way.
  if (provider === 'fetch_url') {
    const targetUrl = payload?.url;
    if (typeof targetUrl !== 'string' || !targetUrl.startsWith('https://')) {
      return response(400, { error: 'fetch_url requires payload.url to be an https:// URL' });
    }
    let step;
    try {
      step = await safeFetchBuffer(targetUrl, {
        headers: {
          'User-Agent': 'AsyncAI-KnowledgeBase/1.0 (document ingestion)',
          'Accept': 'text/html,text/plain,application/json,*/*',
        },
        timeout: 20000,
        maxRedirects: 3,
      });
    } catch (e) {
      const ssrf = /https|private|Host not allowed|Invalid URL|redirect/i.test(e.message);
      log({ event: 'fetch_url_blocked', reason: e.message });
      return response(ssrf ? 400 : 502, { error: `fetch_url failed: ${e.message}` });
    }
    let text = step.buffer.toString('utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100000);
    log({ event: 'fetch_url_done', targetUrl: targetUrl.slice(0, 80), bytes: text.length, status: step.status });
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, url: targetUrl, status: step.status }),
    };
  }

  // ── DuckDuckGo instant answers (GET, no auth) ────────────
  if (provider === 'ddg') {
    const https = require('https');
    const q     = encodeURIComponent((payload.query || '').slice(0, 200));
    const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&t=asyncai`;
    return new Promise((resolve) => {
      https.get(ddgUrl, { headers: { 'User-Agent': 'AsyncAI/2.0' } }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          log({ event: 'upstream_response', status: res.statusCode, durationMs: Date.now() - startedAt });
          resolve({
            statusCode: res.statusCode,
            headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }).on('error', (e) => {
        log({ event: 'upstream_error', error: e.message, durationMs: Date.now() - startedAt });
        resolve(response(502, { error: e.message }));
      });
    });
  }

  // ── web_search — unified search handler (brave, serpapi, ddg fallback) ──
  if (provider === 'web_search') {
    const https    = require('https');
    const http     = require('http');
    const urlMod   = require('url');
    const query    = (payload?.query || '').slice(0, 300);
    const searchProvider = payload?.searchProvider || 'ddg'; // 'brave' | 'serpapi' | 'ddg'
    const searchKey      = apiKey || '';
    const maxResults     = Math.min(payload?.maxResults || 5, 10);

    let searchUrl;
    let reqHeaders = { 'User-Agent': 'AsyncAI/2.0', 'Accept': 'application/json' };

    if (searchProvider === 'brave' && searchKey) {
      searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}&safesearch=off`;
      reqHeaders['X-Subscription-Token'] = searchKey;
      reqHeaders['Accept-Encoding'] = 'gzip';
    } else if (searchProvider === 'serp' && searchKey) {
      searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${maxResults}&api_key=${searchKey}`;
    } else {
      // DuckDuckGo fallback (no key needed)
      searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&t=asyncai`;
    }

    const parsed  = urlMod.parse(searchUrl);
    const client  = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req2 = client.get(searchUrl, { headers: reqHeaders, timeout: 15000 }, (res) => {
        const chunks = [];
        // Handle gzip from Brave
        let decoder = res;
        if ((res.headers['content-encoding'] || '').includes('gzip')) {
          const zlib = require('zlib');
          decoder = res.pipe(zlib.createGunzip());
        }
        decoder.on('data', c => chunks.push(c));
        decoder.on('end', () => {
          log({ event: 'web_search_response', searchProvider, status: res.statusCode, durationMs: Date.now() - startedAt });
          resolve({
            statusCode: res.statusCode,
            headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        decoder.on('error', (e) => resolve(response(502, { error: `Decode error: ${e.message}` })));
      });
      req2.on('error', (e) => {
        log({ event: 'web_search_error', searchProvider, error: e.message });
        resolve(response(502, { error: `Web search failed: ${e.message}` }));
      });
      req2.on('timeout', () => { req2.destroy(); resolve(response(504, { error: 'Web search timed out' })); });
    });
  }

  // ── gnews — GNews API server-side proxy ──────────────────
  if (provider === 'gnews') {
    const https  = require('https');
    const topic  = encodeURIComponent((payload?.topic || '').slice(0, 200));
    const count  = Math.min(payload?.count || 5, 10);
    const lang   = payload?.lang || 'en';
    const gUrl   = `https://gnews.io/api/v4/search?q=${topic}&max=${count}&apikey=${apiKey || ''}&lang=${lang}`;
    return new Promise((resolve) => {
      https.get(gUrl, { headers: { 'User-Agent': 'AsyncAI/2.0' }, timeout: 12000 }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          log({ event: 'gnews_response', status: res.statusCode, durationMs: Date.now() - startedAt });
          resolve({
            statusCode: res.statusCode,
            headers: { ...cors, 'Content-Type': 'application/json' },
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }).on('error', (e) => {
        log({ event: 'gnews_error', error: e.message });
        resolve(response(502, { error: `GNews fetch failed: ${e.message}` }));
      });
    });
  }


  // Build upstream URL. apiPath is attacker-controllable, so it must not be
  // able to change the host we talk to (e.g. '//evil.com', '/@evil.com',
  // backslash tricks, or path traversal). Validate the shape, then verify the
  // assembled URL's host still equals the fixed provider base host.
  if (!isSafeApiPath(apiPath)) {
    log({ event: 'invalid_path' });
    return response(400, { error: 'Invalid path' });
  }
  let url = base + apiPath;
  if (queryParams && Object.keys(queryParams).length) {
    const qs = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    url += '?' + qs;
  }
  try {
    const built = new URL(url);
    const baseHost = new URL(base).host;
    if (built.protocol !== 'https:' || built.host !== baseHost) {
      log({ event: 'invalid_path', builtHost: built.host });
      return response(400, { error: 'Invalid path' });
    }
  } catch {
    return response(400, { error: 'Invalid path' });
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
  } else if (provider === 'github') {
    upstreamHeaders['Authorization'] = `Bearer ${apiKey || ''}`;
    upstreamHeaders['User-Agent']    = 'Async-App/1.0';
    upstreamHeaders['Accept']        = 'application/vnd.github+json';
    upstreamHeaders['X-GitHub-Api-Version'] = '2022-11-28';
  } else if (provider === 'brave') {
    // Brave Search API — key in X-Subscription-Token header
    upstreamHeaders['Accept']                = 'application/json';
    upstreamHeaders['Accept-Encoding']       = 'gzip';
    upstreamHeaders['X-Subscription-Token'] = apiKey || '';
  } else if (provider === 'serpapi') {
    // SerpAPI — key goes in query param (handled by caller via queryParams)
    // No auth header needed; key is passed as api_key query param
  } else if (provider !== 'google' && provider !== 'ddg') {
    // openai, groq, mistral — Bearer token
    upstreamHeaders['Authorization'] = `Bearer ${apiKey || ''}`;
    // Google uses ?key= query param; DDG uses no auth
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
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ base64: b64, contentType }),
    };
  }

  // Return response — preserving SSE content as-is
  return {
    statusCode: upstream.status,
    headers: {
      ...cors,
      'Content-Type':  contentType,
      'Cache-Control': 'no-cache',
    },
    body: upstream.body,
  };
};
