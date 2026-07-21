/* ============================================================
   CLAUDE POWER UI v2 — Unified API Router
   ============================================================

   Each provider generator yields one of:
     { delta: string,   usage: null,   done: false }  — streaming text
     { toolCall: {...}, usage: null,   done: false }  — tool invocation
     { delta: '',       usage: object, done: true  }  — end of turn

   toolCall shape:
     { id: string, name: string, input: object, provider: 'anthropic'|'openai'|'google' }

   Public API:
     ApiRouter.stream(providerId, modelId, apiKey, messages, systemPrompt, options)
     → AsyncGenerator
     ApiRouter.webSearch(query, signal)   → Promise<string>   (summary text)
     ApiRouter.isProxied                  → boolean
   ============================================================ */

import { MODELS_DATA } from './models-data.js';
import { ApiKeyVault } from './auth.js';

export const ApiRouter = (() => {

  // ── Proxy detection ───────────────────────────────────────
  const _isLocalhost = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]'
  );
  const USE_PROXY = !_isLocalhost && location.protocol !== 'file:';
  const PROXY_URL = '/.netlify/functions/proxy';

  // ── Shared SSE line reader ─────────────────────────────────
  async function* readSSELines(response) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) yield line;
    }
    if (buffer.trim()) yield buffer;
  }

  // ── Proxy helper ──────────────────────────────────────────
  async function proxyFetch({ provider, path, apiKey, payload, queryParams, signal }) {
    return fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider, path, apiKey, payload, queryParams }),
      signal,
    });
  }

  // ── Tool schema converters ────────────────────────────────
  // Internal tool schema: { name, description, schema (JSON Schema object) }

  function toAnthropicTool(t) {
    return { name: t.name, description: t.description, input_schema: t.schema };
  }

  function toOpenAITool(t) {
    return { type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } };
  }

  function toGeminiTool(t) {
    // Gemini uses functionDeclarations
    return { name: t.name, description: t.description, parameters: t.schema };
  }

  // ── Anthropic Messages API ─────────────────────────────────
  async function* streamAnthropic(modelId, apiKey, messages, systemPrompt, options) {
    const payload = {
      model:      modelId,
      max_tokens: options.maxTokens || 4096,
      messages,
      stream:     true,
    };
    if (systemPrompt)        payload.system = systemPrompt;
    if (options.tools?.length) payload.tools = options.tools.map(toAnthropicTool);

    let response;
    if (USE_PROXY) {
      response = await proxyFetch({ provider: 'anthropic', path: '/v1/messages', apiKey, payload, signal: options.signal });
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

    let usage     = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    // Track the current tool_use block being built
    let toolBlock = null; // { id, name, jsonBuf }

    for await (const line of readSSELines(response)) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const ev = JSON.parse(data);

        if (ev.type === 'message_start' && ev.message?.usage) {
          usage.inputTokens     = ev.message.usage.input_tokens            || 0;
          usage.cacheReadTokens = ev.message.usage.cache_read_input_tokens || 0;
        }

        // ── Tool use: start of block ──
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          toolBlock = { id: ev.content_block.id, name: ev.content_block.name, jsonBuf: '' };
        }

        // ── Tool use: accumulate JSON ──
        if (ev.type === 'content_block_delta') {
          if (ev.delta?.type === 'text_delta') {
            yield { delta: ev.delta.text, usage: null, done: false };
          }
          if (ev.delta?.type === 'input_json_delta' && toolBlock) {
            toolBlock.jsonBuf += ev.delta.partial_json || '';
          }
        }

        // ── Tool use: block finished — emit toolCall ──
        if (ev.type === 'content_block_stop' && toolBlock) {
          let input = {};
          try { input = JSON.parse(toolBlock.jsonBuf || '{}'); } catch {}
          yield { toolCall: { id: toolBlock.id, name: toolBlock.name, input, provider: 'anthropic' }, usage: null, done: false };
          toolBlock = null;
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

  // ── OpenAI Chat Completions API ────────────────────────────
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
    if (options.tools?.length) {
      payload.tools       = options.tools.map(toOpenAITool);
      payload.tool_choice = 'auto';
    }

    let response;
    if (USE_PROXY) {
      response = await proxyFetch({ provider: providerId, path: '/v1/chat/completions', apiKey, payload, signal: options.signal });
    } else {
      const baseUrl = OPENAI_COMPAT_BASES[providerId] || 'https://api.openai.com';
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body:    JSON.stringify(payload),
        signal:  options.signal,
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    // Accumulate tool_calls across streaming deltas: Map<index, {id,name,argsBuf}>
    const toolCallMap = new Map();

    for await (const line of readSSELines(response)) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        yield { delta: '', usage, done: true };
        break;
      }

      try {
        const ev = JSON.parse(data);

        // ── Text delta ──
        const textDelta = ev.choices?.[0]?.delta?.content;
        if (textDelta) yield { delta: textDelta, usage: null, done: false };

        // ── Tool call deltas (streaming) ──
        const tcDeltas = ev.choices?.[0]?.delta?.tool_calls;
        if (tcDeltas) {
          for (const tc of tcDeltas) {
            if (!toolCallMap.has(tc.index)) {
              toolCallMap.set(tc.index, { id: tc.id || '', name: tc.function?.name || '', argsBuf: '' });
            }
            const entry = toolCallMap.get(tc.index);
            if (tc.id)              entry.id = tc.id;
            if (tc.function?.name)  entry.name += tc.function.name;
            if (tc.function?.arguments) entry.argsBuf += tc.function.arguments;
          }
        }

        if (ev.usage) {
          usage.inputTokens  = ev.usage.prompt_tokens     || 0;
          usage.outputTokens = ev.usage.completion_tokens || 0;
        }

        const finishReason = ev.choices?.[0]?.finish_reason;

        // ── Emit tool calls when stream signals tool_calls finish ──
        if (finishReason === 'tool_calls') {
          for (const [, tc] of toolCallMap) {
            let input = {};
            try { input = JSON.parse(tc.argsBuf || '{}'); } catch {}
            yield { toolCall: { id: tc.id, name: tc.name, input, provider: 'openai' }, usage: null, done: false };
          }
          toolCallMap.clear();
          yield { delta: '', usage, done: true };
        } else if (finishReason === 'stop') {
          yield { delta: '', usage, done: true };
        }
      } catch { /* ignore */ }
    }
  }

  // ── Google Gemini API ──────────────────────────────────────
  async function* streamGemini(modelId, apiKey, messages, systemPrompt, options) {
    // Convert messages, handle tool_result role and assistant tool_calls
    // (buildApiMessages() in app.js emits OpenAI-shaped { tool_calls: [...] }
    // for every non-Anthropic provider, including Gemini — translate here).
    const rawContents = messages.map(m => {
      if (m.role === 'tool') {
        // Tool result from our loop
        return {
          role: 'user',
          parts: [{ functionResponse: { name: m.name, response: { content: m.content } } }],
        };
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        const parts = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
          parts.push({ functionCall: { name: tc.function?.name, args } });
        }
        return { role: 'model', parts };
      }
      return {
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      };
    });

    // Consolidate consecutive turns sharing the same role (e.g. tool result + follow-up user prompt)
    const contents = [];
    for (const item of rawContents) {
      const prev = contents[contents.length - 1];
      if (prev && prev.role === item.role) {
        prev.parts.push(...item.parts);
      } else {
        contents.push(item);
      }
    }

    const payload = {
      contents,
      generationConfig: { maxOutputTokens: options.maxTokens || 4096 },
    };
    if (systemPrompt) payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    if (options.tools?.length) {
      payload.tools = [{ functionDeclarations: options.tools.map(toGeminiTool) }];
    }

    let response;
    if (USE_PROXY) {
      response = await proxyFetch({
        provider: 'google',
        path: `/v1beta/models/${modelId}:streamGenerateContent`,
        apiKey: '',
        payload,
        queryParams: { key: apiKey, alt: 'sse' },
        signal: options.signal,
      });
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`;
      response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: options.signal,
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
        const parts = ev.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            yield { delta: part.text, usage: null, done: false };
          }
          if (part.functionCall) {
            yield {
              toolCall: {
                id:       `gemini-${Date.now()}`,
                name:     part.functionCall.name,
                input:    part.functionCall.args || {},
                provider: 'google',
              },
              usage: null, done: false,
            };
          }
        }
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

  // ── Web Search (DuckDuckGo via proxy) ─────────────────────
  async function webSearch(query, signal, maxResults = 5) {
    try {
      const cfg = JSON.parse(localStorage.getItem('async_agent_v1') || '{}');
      const prov = cfg.webSearch?.provider || 'ddg';
      let key = '';
      
      if (prov !== 'ddg') {
        try { key = await ApiKeyVault?.getWebSearchKey() || ''; } catch {}
      }

      if (prov === 'brave' && key) {
        const response = await proxyFetch({
          provider: 'web_search', path: '/', apiKey: key,
          payload: { query, searchProvider: 'brave', maxResults }, signal
        });
        if (!response.ok) return `Search failed (${response.status}).`;
        const data = await response.json();
        const hits = data.web?.results || [];
        if (!hits.length) return `No Brave Search results for "${query}".`;
        return `**Web Search: "${query}"** (Brave)\n\n` +
          hits.slice(0, maxResults).map(h => `• **${h.title}**\n  ${h.description || ''}\n  ${h.url}`).join('\n\n');
      }

      if (prov === 'serp' && key) {
        const response = await proxyFetch({
          provider: 'web_search', path: '/', apiKey: key,
          payload: { query, searchProvider: 'serp', maxResults }, signal
        });
        if (!response.ok) return `Search failed (${response.status}).`;
        const data = await response.json();
        const hits = data.organic_results || [];
        if (!hits.length) return `No SerpAPI results for "${query}".`;
        return `**Web Search: "${query}"** (Google via SerpAPI)\n\n` +
          hits.slice(0, maxResults).map(h => `• **${h.title}**\n  ${h.snippet || ''}\n  ${h.link}`).join('\n\n');
      }

      // ── DuckDuckGo via proxy (no key) ─────────────────
      const response = await proxyFetch({
        provider: 'ddg',
        path: '/',
        apiKey: '',
        payload: { query },
        signal,
      });
      if (!response.ok) return `Search failed (${response.status}).`;
      const data = await response.json();

      const results = [];
      if (data.AbstractText) results.push(`**Summary:** ${data.AbstractText}`);
      if (data.Answer)       results.push(`**Answer:** ${data.Answer}`);
      if (data.RelatedTopics?.length) {
        const topics = data.RelatedTopics
          .filter(t => t.Text)
          .slice(0, 5)
          .map(t => `• ${t.Text}`);
        if (topics.length) results.push('**Related:**\n' + topics.join('\n'));
      }
      return results.length
        ? results.join('\n\n')
        : `No instant results for "${query}". Try rephrasing.`;
    } catch (e) {
      return `Search error: ${e.message}`;
    }
  }

  // ── Public stream() ───────────────────────────────────────
  /**
   * @param {string} providerId
   * @param {string} modelId
   * @param {string} apiKey
   * @param {Array}  messages   [{role, content}] — may include {role:'tool', name, content, tool_use_id}
   * @param {string} systemPrompt
   * @param {Object} options    { maxTokens, signal, tools: [{name, description, schema}] }
   * @yields {{ delta?, toolCall?, usage?, done }}
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

  function resolveProvider(modelId) {
    if (typeof MODELS_DATA === 'undefined') return null;
    return MODELS_DATA.getModel(modelId)?.provider || null;
  }

  return { stream, webSearch, resolveProvider, isProxied: USE_PROXY };
})();
window.ApiRouter = ApiRouter;
