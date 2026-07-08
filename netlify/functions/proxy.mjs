/**
 * Claude Power UI — AI Proxy Function
 * ─────────────────────────────────────────────────────────────
 * Routes all AI provider API calls through this Netlify Function
 * to avoid CORS blocks on production deployments.
 *
 * This is a BYOK (Bring Your Own Key) proxy:
 *   - The user's API key is passed per-request from the browser
 *   - Keys are never stored here — only forwarded in-flight over HTTPS
 *   - No environment variables required
 *
 * Supports: Anthropic, OpenAI, Groq, Mistral (OpenAI-compat), Google Gemini
 *
 * Endpoint: POST /.netlify/functions/proxy
 * Body: { provider, path, apiKey, payload, queryParams? }
 *
 * Uses Netlify Functions v2 to stream the upstream SSE response directly
 * back to the browser — zero buffering, no latency added.
 */

const PROVIDER_BASE = {
  anthropic: 'https://api.anthropic.com',
  openai:    'https://api.openai.com',
  groq:      'https://api.groq.com/openai',
  mistral:   'https://api.mistral.ai',
  google:    'https://generativelanguage.googleapis.com',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  // ── CORS preflight ───────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse request ────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { provider, path: apiPath, apiKey, payload, queryParams } = body;

  if (!provider || !apiPath || !apiKey || !payload) {
    return new Response(JSON.stringify({ error: 'Missing required fields: provider, path, apiKey, payload' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const base = PROVIDER_BASE[provider];
  if (!base) {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Build upstream URL ───────────────────────────────────────
  let url = base + apiPath;
  if (queryParams && Object.keys(queryParams).length) {
    url += '?' + new URLSearchParams(queryParams).toString();
  }

  // ── Build upstream headers ───────────────────────────────────
  const upstreamHeaders = { 'Content-Type': 'application/json' };

  if (provider === 'anthropic') {
    upstreamHeaders['x-api-key']            = apiKey;
    upstreamHeaders['anthropic-version']    = '2023-06-01';
    // Server-to-server — no need for dangerous-browser-calls header
  } else if (provider === 'google') {
    // Google uses ?key= query param (added above via queryParams)
    // No Authorization header needed
  } else {
    // OpenAI-compatible: openai, groq, mistral
    upstreamHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  // ── Forward to upstream AI provider ─────────────────────────
  let upstream;
  try {
    upstream = await fetch(url, {
      method:  'POST',
      headers: upstreamHeaders,
      body:    JSON.stringify(payload),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Upstream fetch failed: ${e.message}` }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Stream response back to browser ─────────────────────────
  // Pass upstream status and content-type through unchanged.
  // This preserves SSE streaming without buffering.
  const contentType = upstream.headers.get('Content-Type') || 'text/event-stream';

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type':  contentType,
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

// Canonical URL: /.netlify/functions/proxy
// (config.path only applies when Netlify's build system processes the function)
