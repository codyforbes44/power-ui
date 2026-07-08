/* ============================================================
   CLAUDE POWER UI v2 — Unified API Router
   ============================================================

   Each provider function is an async generator that yields:
     { delta: string, usage: { inputTokens, outputTokens, cacheReadTokens }, done: boolean }

   Public API:
     ApiRouter.stream(providerId, modelId, apiKey, messages, systemPrompt, options)
     → AsyncGenerator<{ delta, usage, done }>

   Proxy mode:
     When running on a production host (non-localhost, non-file://),
     all requests are routed through the Netlify Function at /api/proxy
     to avoid browser CORS restrictions on AI provider APIs.
   ============================================================ */

const ApiRouter = (() => {

  // ── Detect whether we need the server-side proxy ─────────────
  // On localhost (server.py) and file:// direct access: make API
  // calls directly (file:// is blocked anyway, but probe handles that).
  // On Netlify / any other host: route through /api/proxy.
  const _isLocalhost = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]'
  );
  const USE_PROXY = !_isLocalhost && location.protocol !== 'file:';

  // ──────────────────────────────────────────────────────────
  // Shared SSE line reader
  // Buffers partial lines across read() calls.
  // ──────────────────────────────────────────────────────────
  async function* readSSELines(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial last line
      for (const line of lines) {
        yield line;
      }
    }
    // Flush any remaining buffer
    if (buffer.trim()) yield buffer;
  }

  // ──────────────────────────────────────────────────────────
  // Proxy helper — wraps any fetch through /api/proxy
  // ──────────────────────────────────────────────────────────
  // Netlify Functions v2 are served at /.netlify/functions/{name} by default.
  // The config.path export only applies when Netlify's build system processes
  // the function (CLI / Git deploy). For zip deploys, use the canonical path.
  const PROXY_URL = '/.netlify/functions/proxy';

  async function proxyFetch({ provider, path, apiKey, payload, queryParams, signal }) {
    const response = await fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider, path, apiKey, payload, queryParams }),
      signal,
    });
    return response;
  }

  // ──────────────────────────────────────────────────────────
  // Anthropic Messages API
  // ──────────────────────────────────────────────────────────
  async function* streamAnthropic(modelId, apiKey, messages, systemPrompt, options) {
    const payload = {
      model:      modelId,
      max_tokens: options.maxTokens || 4096,
      system:     systemPrompt || undefined,
      messages,
      stream:     true,
    };

    let response;
    if (USE_PROXY) {
      response = await proxyFetch({
        provider: 'anthropic',
        path:     '/v1/messages',
        apiKey,
        payload,
        signal:   options.signal,
      });
    } else {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-api-key':       apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body:   JSON.stringify(payload),
        signal: options.signal,
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic API error ${response.status}`);
    }

    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

    for await (const line of readSSELines(response)) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const ev = JSON.parse(data);

        if (ev.type === 'message_start' && ev.message?.usage) {
          usage.inputTokens     = ev.message.usage.input_tokens             || 0;
          usage.cacheReadTokens = ev.message.usage.cache_read_input_tokens  || 0;
        }

        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          yield { delta: ev.delta.text, usage: null, done: false };
        }

        if (ev.type === 'message_delta' && ev.usage) {
          usage.outputTokens = ev.usage.output_tokens || 0;
        }

        if (ev.type === 'message_stop') {
          yield { delta: '', usage, done: true };
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // ──────────────────────────────────────────────────────────
  // OpenAI Chat Completions API (also used for Groq + Mistral)
  // ──────────────────────────────────────────────────────────
  const OPENAI_COMPAT_BASES = {
    openai:  'https://api.openai.com',
    groq:    'https://api.groq.com/openai',
    mistral: 'https://api.mistral.ai',
  };

  async function* streamOpenAI(modelId, apiKey, messages, systemPrompt, options, providerId) {
    const apiMessages = [];
    if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
    apiMessages.push(...messages);

    const payload = {
      model:          modelId,
      messages:       apiMessages,
      stream:         true,
      stream_options: { include_usage: true },
      max_tokens:     options.maxTokens || 4096,
    };

    let response;
    if (USE_PROXY) {
      response = await proxyFetch({
        provider: providerId,
        path:     '/v1/chat/completions',
        apiKey,
        payload,
        signal:   options.signal,
      });
    } else {
      const baseUrl = OPENAI_COMPAT_BASES[providerId] || 'https://api.openai.com';
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body:   JSON.stringify(payload),
        signal: options.signal,
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

    for await (const line of readSSELines(response)) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        yield { delta: '', usage, done: true };
        break;
      }

      try {
        const ev = JSON.parse(data);
        const delta = ev.choices?.[0]?.delta?.content;
        if (delta) yield { delta, usage: null, done: false };
        if (ev.usage) {
          usage.inputTokens  = ev.usage.prompt_tokens     || 0;
          usage.outputTokens = ev.usage.completion_tokens || 0;
        }
        if (ev.choices?.[0]?.finish_reason === 'stop') {
          yield { delta: '', usage, done: true };
        }
      } catch { /* ignore */ }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Google Gemini API
  // ──────────────────────────────────────────────────────────
  async function* streamGemini(modelId, apiKey, messages, systemPrompt, options) {
    const contents = messages.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const payload = {
      contents,
      generationConfig: { maxOutputTokens: options.maxTokens || 4096 },
    };
    if (systemPrompt) payload.systemInstruction = { parts: [{ text: systemPrompt }] };

    let response;
    if (USE_PROXY) {
      response = await proxyFetch({
        provider:    'google',
        path:        `/v1beta/models/${modelId}:streamGenerateContent`,
        apiKey:      '',           // Google uses query param; proxy sets it via queryParams
        payload,
        queryParams: { key: apiKey, alt: 'sse' },
        signal:      options.signal,
      });
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`;
      response = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  options.signal,
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini API error ${response.status}`);
    }

    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

    for await (const line of readSSELines(response)) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();

      try {
        const ev = JSON.parse(data);
        const text = ev.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield { delta: text, usage: null, done: false };
        if (ev.usageMetadata) {
          usage.inputTokens  = ev.usageMetadata.promptTokenCount     || 0;
          usage.outputTokens = ev.usageMetadata.candidatesTokenCount || 0;
        }
        if (ev.candidates?.[0]?.finishReason) {
          yield { delta: '', usage, done: true };
        }
      } catch { /* ignore */ }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Public interface
  // ──────────────────────────────────────────────────────────

  /**
   * Stream a completion from any supported provider.
   *
   * @param {string} providerId - 'anthropic' | 'openai' | 'google' | 'groq' | 'mistral'
   * @param {string} modelId    - model identifier
   * @param {string} apiKey     - API key for the provider
   * @param {Array}  messages   - [{role, content}]
   * @param {string} systemPrompt
   * @param {Object} options    - { maxTokens, signal }
   * @yields {{ delta: string, usage: object|null, done: boolean }}
   */
  async function* stream(providerId, modelId, apiKey, messages, systemPrompt, options = {}) {
    switch (providerId) {
      case 'anthropic':
        yield* streamAnthropic(modelId, apiKey, messages, systemPrompt, options);
        break;
      case 'openai':
      case 'groq':
      case 'mistral':
        yield* streamOpenAI(modelId, apiKey, messages, systemPrompt, options, providerId);
        break;
      case 'google':
        yield* streamGemini(modelId, apiKey, messages, systemPrompt, options);
        break;
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  /**
   * Resolve the provider for a given model ID.
   */
  function resolveProvider(modelId) {
    if (typeof MODELS_DATA === 'undefined') return null;
    return MODELS_DATA.getModel(modelId)?.provider || null;
  }

  return { stream, resolveProvider, isProxied: USE_PROXY };
})();
