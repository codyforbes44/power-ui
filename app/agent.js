/**
 * agent.js — Super Admin Agent System
 * Provides: AgentConfig, KnowledgeBase (IndexedDB), tools, and cross-session memory
 * Access restricted to isSuperAdmin() users only.
 */

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────
  const AGENT_CONFIG_KEY = 'async_agent_v1';
  const KB_DB_NAME       = 'async_kb_v1';
  const KB_STORE         = 'documents';
  const AGENT_MEM_KEY    = 'async_agent_memories_v1'; // cross-session super-agent facts

  // ──────────────────────────────────────────────────────────
  // Default AgentConfig
  // ──────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    enabled:      true,
    persona:      'Aria',
    avatarEmoji:  '✦',
    systemPrompt: `You are Aria, a hyper-capable AI super-assistant with access to all tools, knowledge bases, and persistent memory. You have access to:
- Web search (search the live internet for current information)
- Wikipedia lookups (authoritative reference information)
- Weather (current conditions anywhere in the world)
- GitHub search (find repositories, code, and developers)
- News (latest headlines on any topic)
- Persistent cross-session memory (facts stored across ALL conversations)
- Document knowledge base (uploaded PDFs, text files, and ingested web pages)

Always be proactive about using your tools. When asked about current events, search the web. When asked about past conversations, check your memory. When relevant documents are in the knowledge base, cite them. You have full API access to all configured providers.

You are exclusively serving your super-admin user. Be direct, thorough, and highly capable.`,
    temperature:  0.7,
    maxTokens:    8192,
    tools: {
      webSearch:    true,
      wikipedia:    true,
      weather:      true,
      githubSearch: true,
      news:          true,
      knowledgeBase:true,
      crossMemory:  true,
    },
    memory: {
      scope: 'all',           // 'all' | 'selected' | 'none'
      selectedSessions: [],
    },
    knowledgeBase: {
      enabled:   true,
      chunkSize: 800,
      maxChunks: 500,
      topK:      5,
    },
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };

  // ──────────────────────────────────────────────────────────
  // AgentConfig persistence
  // ──────────────────────────────────────────────────────────
  const AgentConfig = {
    get() {
      try {
        const raw = localStorage.getItem(AGENT_CONFIG_KEY);
        return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
      } catch { return { ...DEFAULT_CONFIG }; }
    },
    save(cfg) {
      cfg.updatedAt = new Date().toISOString();
      localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(cfg));
    },
    reset() {
      localStorage.removeItem(AGENT_CONFIG_KEY);
    },
    isEnabled() {
      const cfg = this.get();
      return cfg.enabled && (typeof AuthSystem !== 'undefined' ? AuthSystem.isSuperAdmin() : false);
    },
  };

  // ──────────────────────────────────────────────────────────
  // Cross-session memory (super-agent scoped)
  // ──────────────────────────────────────────────────────────
  const AgentMemory = {
    _load() {
      try { return JSON.parse(localStorage.getItem(AGENT_MEM_KEY)) || []; } catch { return []; }
    },
    _save(mems) {
      localStorage.setItem(AGENT_MEM_KEY, JSON.stringify(mems));
    },
    add(key, value, tags = []) {
      const mems = this._load();
      // Update if key exists, otherwise push
      const idx = mems.findIndex(m => m.key === key);
      const entry = { key, value, tags, timestamp: new Date().toISOString(), source: 'agent' };
      if (idx >= 0) { mems[idx] = entry; } else { mems.push(entry); }
      this._save(mems);
      return entry;
    },
    search(query, k = 8) {
      const mems = this._load();
      if (!query) return mems.slice(-k);
      const q = query.toLowerCase();
      return mems
        .filter(m => (m.key + ' ' + m.value + ' ' + (m.tags||[]).join(' ')).toLowerCase().includes(q))
        .slice(-k);
    },
    getAll() { return this._load(); },
    delete(key) {
      const mems = this._load().filter(m => m.key !== key);
      this._save(mems);
    },
    clear() { localStorage.removeItem(AGENT_MEM_KEY); },
    buildContextBlock(query = '') {
      const cfg = AgentConfig.get();
      if (!cfg.tools.crossMemory) return '';
      const mems = this.search(query, cfg.knowledgeBase.topK || 5);
      if (!mems.length) return '';
      const facts = mems.map(m => `• **${m.key}**: ${m.value}`).join('\n');
      return `\n\n## 🧠 Super-Agent Cross-Session Memory\n${facts}\n`;
    },
  };

  // ──────────────────────────────────────────────────────────
  // Knowledge Base (IndexedDB)
  // ──────────────────────────────────────────────────────────
  const KnowledgeBase = {
    _dbPromise: null,
    _getDB() {
      if (this._dbPromise) return this._dbPromise;
      this._dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(KB_DB_NAME, 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(KB_STORE)) {
            const store = db.createObjectStore(KB_STORE, { keyPath: 'id' });
            store.createIndex('title', 'title', { unique: false });
            store.createIndex('source', 'source', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
      });
      return this._dbPromise;
    },

    async listAll() {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(KB_STORE, 'readonly');
        const req = tx.objectStore(KB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror  = () => reject(req.error);
      });
    },

    async get(id) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readonly').objectStore(KB_STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
      });
    },

    async add(doc) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).put(doc);
        req.onsuccess = () => resolve(doc);
        req.onerror  = () => reject(req.error);
      });
    },

    async delete(id) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror  = () => reject(req.error);
      });
    },

    async clear() {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror  = () => reject(req.error);
      });
    },

    // ── Chunking ──────────────────────────────────────────
    chunkText(text, size = 800) {
      const chunks = [];
      let i = 0;
      const clean = (text || '').replace(/\s+/g, ' ').trim();
      while (i < clean.length) {
        // Try to break at sentence boundary
        let end = Math.min(i + size, clean.length);
        if (end < clean.length) {
          const lastPeriod = clean.lastIndexOf('.', end);
          if (lastPeriod > i + size * 0.5) end = lastPeriod + 1;
        }
        chunks.push(clean.slice(i, end).trim());
        i = end;
      }
      return chunks.filter(c => c.length > 10);
    },

    // ── Ingest a plain-text document ──────────────────────
    async ingestText(text, meta = {}) {
      const cfg = AgentConfig.get().knowledgeBase;
      const chunks = this.chunkText(text, cfg.chunkSize || 800)
        .slice(0, cfg.maxChunks || 500)
        .map((t, i) => ({ text: t, idx: i }));
      const doc = {
        id:        meta.id       || `doc_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        title:     meta.title    || 'Untitled',
        source:    meta.source   || 'upload',
        type:      meta.type     || 'text',
        fileSize:  meta.fileSize || text.length,
        chunks,
        createdAt: new Date().toISOString(),
      };
      await this.add(doc);
      return doc;
    },

    // ── Ingest a URL (via proxy CORS bypass) ──────────────
    async ingestUrl(url) {
      // Use existing proxy to fetch the URL content
      let text;
      try {
        const res = await fetch(`/.netlify/functions/proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'fetch_url',
            path: '/',
            payload: { url },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        text = data.text || data.content || JSON.stringify(data);
      } catch (e) {
        // Fallback: try direct fetch (may fail CORS)
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
          const html = await r.text();
          // Strip HTML tags
          text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50000);
        } catch (e2) {
          throw new Error(`Could not fetch URL: ${e.message}`);
        }
      }
      const title = url.split('/').filter(Boolean).pop() || url;
      return this.ingestText(text, { title, source: url, type: 'url' });
    },

    // ── Ingest a File object (TXT, MD, JSON, CSV) ─────────
    async ingestFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async e => {
          try {
            const text = e.target.result;
            const doc = await this.ingestText(text, {
              title:    file.name,
              source:   `file:${file.name}`,
              type:     file.name.split('.').pop().toLowerCase(),
              fileSize: file.size,
            });
            resolve(doc);
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsText(file);
      });
    },

    // ── Semantic (keyword) search across all chunks ────────
    async search(query, k = 5) {
      const docs = await this.listAll();
      if (!docs.length || !query) return [];
      const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const scored = [];
      for (const doc of docs) {
        for (const chunk of (doc.chunks || [])) {
          const text = chunk.text.toLowerCase();
          const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
          if (score > 0) scored.push({ doc, chunk, score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    },

    // ── Build context block for system prompt injection ────
    async buildContextBlock(query = '') {
      const cfg = AgentConfig.get();
      if (!cfg.tools.knowledgeBase || !cfg.knowledgeBase.enabled) return '';
      const results = await this.search(query, cfg.knowledgeBase.topK || 5);
      if (!results.length) return '';
      const excerpts = results.map(r =>
        `[${r.doc.title}]\n${r.chunk.text}`
      ).join('\n\n---\n\n');
      return `\n\n## 📚 Knowledge Base Context\n${excerpts}\n`;
    },
  };

  // ──────────────────────────────────────────────────────────
  // Super-Agent tools (additional to BUILT_IN_TOOLS)
  // ──────────────────────────────────────────────────────────
  const SUPER_TOOLS = [
    {
      name: 'wikipedia_search',
      description: 'Search Wikipedia for authoritative reference information on any topic, person, place, concept, or historical event.',
      schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The topic to search on Wikipedia' },
          sentences: { type: 'number', description: 'Number of summary sentences to return (default 5)' },
        },
        required: ['topic'],
      },
    },
    {
      name: 'get_weather',
      description: 'Get current weather conditions for any location in the world.',
      schema: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City, region, or coordinates (e.g. "London", "New York, NY", "48.8566,2.3522")' },
          format: { type: 'string', enum: ['brief', 'full'], description: 'How much detail to return' },
        },
        required: ['location'],
      },
    },
    {
      name: 'search_github',
      description: 'Search GitHub for repositories, code, or developers. Useful for finding open-source projects, code examples, or popular libraries.',
      schema: {
        type: 'object',
        properties: {
          query:  { type: 'string', description: 'Search query' },
          type:   { type: 'string', enum: ['repositories', 'code', 'users'], description: 'What to search for (default: repositories)' },
          limit:  { type: 'number', description: 'Max results to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_news',
      description: 'Get the latest news headlines and articles on any topic.',
      schema: {
        type: 'object',
        properties: {
          topic:  { type: 'string', description: 'News topic or keyword' },
          count:  { type: 'number', description: 'Number of articles (default 5)' },
        },
        required: ['topic'],
      },
    },
    {
      name: 'kb_search',
      description: 'Search your personal knowledge base for information from uploaded documents and ingested web pages.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in the knowledge base' },
        },
        required: ['query'],
      },
    },
    {
      name: 'agent_memory_save',
      description: 'Save an important fact to your cross-session super-agent memory. This persists across ALL chat sessions.',
      schema: {
        type: 'object',
        properties: {
          key:   { type: 'string', description: 'Short label for the memory' },
          value: { type: 'string', description: 'The information to remember' },
          tags:  { type: 'array', items: { type: 'string' }, description: 'Topic tags' },
        },
        required: ['key', 'value'],
      },
    },
    {
      name: 'agent_memory_recall',
      description: 'Recall information from your cross-session super-agent memory.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for in memory' },
        },
        required: ['query'],
      },
    },
  ];

  // ──────────────────────────────────────────────────────────
  // Super-Tool executor
  // ──────────────────────────────────────────────────────────
  async function executeSuperTool(toolName, input) {
    switch (toolName) {

      case 'wikipedia_search': {
        const topic = encodeURIComponent(input.topic);
        const sentences = input.sentences || 5;
        try {
          const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${topic}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data.type === 'disambiguation') {
            return `"${input.topic}" is ambiguous on Wikipedia. Try a more specific term.`;
          }
          const extract = (data.extract || '').split('. ').slice(0, sentences).join('. ');
          const imgNote = data.thumbnail?.source ? `\n\n[Wikipedia image available]` : '';
          return `**${data.title}** (Wikipedia)\n\n${extract}${imgNote}\n\nSource: ${data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${topic}`}`;
        } catch (e) {
          return `Wikipedia search failed for "${input.topic}": ${e.message}`;
        }
      }

      case 'get_weather': {
        try {
          const format = input.format === 'full' ? 'j2' : '?format=3';
          const loc = encodeURIComponent(input.location);
          let url, text;
          if (format === 'j2') {
            url = `https://wttr.in/${loc}?format=j2`;
            const res = await fetch(url);
            const data = await res.json();
            const cur = data.current_condition?.[0];
            const area = data.nearest_area?.[0];
            const city = area?.areaName?.[0]?.value || input.location;
            const country = area?.country?.[0]?.value || '';
            text = `**${city}, ${country}** — Current Weather\n`;
            text += `🌡 ${cur.temp_C}°C (${cur.temp_F}°F)\n`;
            text += `☁ ${cur.weatherDesc?.[0]?.value}\n`;
            text += `💧 Humidity: ${cur.humidity}%\n`;
            text += `💨 Wind: ${cur.windspeedKmph} km/h ${cur.winddir16Point}\n`;
            text += `👁 Visibility: ${cur.visibility} km`;
          } else {
            url = `https://wttr.in/${loc}?format=3`;
            const res = await fetch(url);
            text = await res.text();
          }
          return text.trim();
        } catch (e) {
          return `Weather unavailable for "${input.location}": ${e.message}`;
        }
      }

      case 'search_github': {
        try {
          const type  = input.type || 'repositories';
          const limit = Math.min(input.limit || 5, 10);
          const q     = encodeURIComponent(input.query);
          const url   = `https://api.github.com/search/${type}?q=${q}&per_page=${limit}&sort=stars`;
          const res   = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } });
          const data  = await res.json();
          if (!data.items?.length) return `No GitHub ${type} found for "${input.query}".`;
          if (type === 'repositories') {
            return `**GitHub Repositories for "${input.query}"**\n\n` +
              data.items.map(r =>
                `• **${r.full_name}** ⭐${r.stargazers_count.toLocaleString()}\n  ${r.description || 'No description'}\n  ${r.html_url}`
              ).join('\n\n');
          } else if (type === 'users') {
            return `**GitHub Users for "${input.query}"**\n\n` +
              data.items.map(u => `• [${u.login}](${u.html_url}) — ${u.html_url}`).join('\n');
          }
          return JSON.stringify(data.items.slice(0, limit), null, 2);
        } catch (e) {
          return `GitHub search failed: ${e.message}`;
        }
      }

      case 'get_news': {
        try {
          const topic = encodeURIComponent(input.topic);
          const count = Math.min(input.count || 5, 10);
          const newsApiKey = (() => {
            try { return JSON.parse(localStorage.getItem('cpu_vault_v1') || '{}').newsapi; } catch { return ''; }
          })();
          let articles = [];
          if (newsApiKey) {
            const res = await fetch(`https://gnews.io/api/v4/search?q=${topic}&max=${count}&apikey=${newsApiKey}&lang=en`);
            const data = await res.json();
            articles = data.articles || [];
          } else {
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${new Date().toISOString().slice(0,10).replace(/-/g,'/')}`);
            const data = await res.json();
            const news = data.news || [];
            return news.slice(0, count).map(n =>
              `• ${(n.story || '').replace(/<[^>]+>/g,'').slice(0,200)}`
            ).join('\n') || `No news data available. Add a GNews API key in Settings → Agent for live news.`;
          }
          if (!articles.length) return `No news found for "${input.topic}".`;
          return `**News: "${input.topic}"**\n\n` +
            articles.map(a =>
              `• **${a.title}** (${a.source?.name || 'unknown'})\n  ${a.description?.slice(0,140) || ''}\n  ${a.url}`
            ).join('\n\n');
        } catch (e) {
          return `News search failed: ${e.message}`;
        }
      }

      case 'kb_search': {
        const results = await KnowledgeBase.search(input.query);
        if (!results.length) return `No knowledge base results for "${input.query}".`;
        return `**Knowledge Base Results for "${input.query}"**\n\n` +
          results.map(r => `**[${r.doc.title}]** (score: ${r.score})\n${r.chunk.text}`).join('\n\n---\n\n');
      }

      case 'agent_memory_save': {
        const entry = AgentMemory.add(input.key, input.value, input.tags || []);
        return `✅ Saved to super-agent memory: "${entry.key}" = "${entry.value}"`;
      }

      case 'agent_memory_recall': {
        const mems = AgentMemory.search(input.query);
        if (!mems.length) return `No super-agent memories found for "${input.query}".`;
        return `**Agent Memory: "${input.query}"**\n\n` +
          mems.map(m => `• **${m.key}**: ${m.value}`).join('\n');
      }

      default:
        return null; // Not a super-tool — let main executeTool() handle it
    }
  }

  // ──────────────────────────────────────────────────────────
  // System prompt builder
  // ──────────────────────────────────────────────────────────
  async function buildSuperAgentSystemPrompt(userMessage = '') {
    const cfg = AgentConfig.get();
    if (!cfg.enabled) return null;

    let prompt = cfg.systemPrompt || DEFAULT_CONFIG.systemPrompt;

    // Inject cross-session memory
    if (cfg.tools.crossMemory) {
      prompt += AgentMemory.buildContextBlock(userMessage);
    }

    // Inject knowledge base context
    if (cfg.tools.knowledgeBase && cfg.knowledgeBase.enabled) {
      const kbBlock = await KnowledgeBase.buildContextBlock(userMessage);
      prompt += kbBlock;
    }

    // Tool availability note
    const enabledTools = Object.entries(cfg.tools)
      .filter(([,v]) => v)
      .map(([k]) => ({
        webSearch:     'web_search (live internet)',
        wikipedia:     'wikipedia_search (reference info)',
        weather:       'get_weather (live weather)',
        githubSearch:  'search_github (repositories & code)',
        news:          'get_news (latest headlines)',
        knowledgeBase: 'kb_search (your personal documents)',
        crossMemory:   'agent_memory_recall / agent_memory_save (cross-session memory)',
      }[k]))
      .filter(Boolean);

    if (enabledTools.length) {
      prompt += `\n\n## Available Tools\n${enabledTools.map(t => `- ${t}`).join('\n')}`;
    }

    return prompt;
  }

  // ──────────────────────────────────────────────────────────
  // Get all tools for this super-admin session
  // ──────────────────────────────────────────────────────────
  function getSuperTools() {
    const cfg = AgentConfig.get();
    const map = {
      wikipedia:     'wikipedia_search',
      weather:       'get_weather',
      githubSearch:  'search_github',
      news:          'get_news',
      knowledgeBase: 'kb_search',
      crossMemory:   ['agent_memory_save', 'agent_memory_recall'],
    };
    const enabled = new Set();
    for (const [key, toolNames] of Object.entries(map)) {
      if (cfg.tools[key]) {
        [].concat(toolNames).forEach(t => enabled.add(t));
      }
    }
    return SUPER_TOOLS.filter(t => enabled.has(t.name));
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────
  window.SuperAgent = {
    config:      AgentConfig,
    memory:      AgentMemory,
    kb:          KnowledgeBase,
    tools:       SUPER_TOOLS,
    getSuperTools,
    executeSuperTool,
    buildSuperAgentSystemPrompt,
    DEFAULT_CONFIG,
  };

})();
