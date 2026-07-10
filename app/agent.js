/**
 * agent.js — Super Admin Agent System (v2)
 * Provides: AgentConfig, KnowledgeBase (IndexedDB), tools, and cross-session memory.
 * Access restricted to isSuperAdmin() users only.
 *
 * New in v2:
 *   Tools:   web_search, calculate, run_code, create_note, list_kb_docs, analyze_image
 *   Config:  webSearchProvider, webSearchApiKey, memoryCategories, apiIntegrations[]
 */

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────
  const AGENT_CONFIG_KEY = 'async_agent_v1';
  const KB_DB_NAME       = 'async_kb_v1';
  const KB_STORE         = 'documents';
  const AGENT_MEM_KEY    = 'async_agent_memories_v1';

  // ──────────────────────────────────────────────────────────
  // Default config
  // ──────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    enabled:      true,
    persona:      'Aria',
    avatarEmoji:  '✦',
    systemPrompt: `You are Aria, a hyper-capable AI super-assistant with access to all tools, knowledge bases, and persistent memory. You have access to:
- Web search (search the live internet for current information and real-time data)
- Wikipedia lookups (authoritative reference information)
- Weather (current conditions anywhere in the world)
- GitHub search (find repositories, code, and developers)
- News (latest headlines on any topic)
- Calculator (evaluate mathematical expressions)
- Code runner (execute JavaScript snippets for analysis and computation)
- Persistent cross-session memory (facts stored across ALL conversations, organized by category)
- Document knowledge base (uploaded PDFs, text files, notes, and ingested web pages)
- Custom API integrations (call configured external services on demand)
- Image analysis (analyze images using vision capabilities)
- Note creation (save information directly to your knowledge base)

Always be proactive about using your tools. When asked about current events, search the web. When asked about past conversations, check your memory. When relevant documents are in the knowledge base, cite them. For math, use the calculator. You have full API access to all configured providers.

You are exclusively serving your super-admin user. Be direct, thorough, and highly capable.`,
    temperature:  0.7,
    maxTokens:    8192,

    // ── Tool toggles ──────────────────────────────────────
    tools: {
      webSearch:      true,
      wikipedia:      true,
      weather:        true,
      githubSearch:   true,
      news:           true,
      knowledgeBase:  true,
      crossMemory:    true,
      calculator:     true,   // NEW
      codeRunner:     false,  // NEW (off by default — runs JS)
      imageAnalysis:  false,  // NEW (requires vision model)
      createNote:     true,   // NEW
      listKbDocs:     true,   // NEW
      apiIntegrations:false,  // NEW (enabled when integrations configured)
    },

    // ── Web search ─────────────────────────────────────────
    webSearch: {
      provider:  'ddg',   // 'ddg' | 'brave' | 'serp'
      apiKey:    '',
      maxResults: 5,
    },

    // ── Memory ────────────────────────────────────────────
    memory: {
      scope:            'all',   // 'all' | 'selected' | 'none'
      selectedSessions: [],
      categories: {
        preferences: [],  // communication style, format, detail level
        projects:    [],  // ongoing work context
        contacts:    [],  // people, emails, relationships
        dates:       [],  // recurring events, deadlines
      },
    },

    // ── Knowledge base ────────────────────────────────────
    knowledgeBase: {
      enabled:   true,
      chunkSize: 800,
      maxChunks: 500,
      topK:      5,
    },

    // ── API integrations ─────────────────────────────────
    // Each: { id, name, endpoint, apiKey, authType, description, enabled, lastUsed }
    apiIntegrations: [],

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // ──────────────────────────────────────────────────────────
  // AgentConfig
  // ──────────────────────────────────────────────────────────
  const AgentConfig = {
    get() {
      try {
        const raw = localStorage.getItem(AGENT_CONFIG_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        const saved = JSON.parse(raw);
        // Deep merge tools and sub-objects
        const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        Object.assign(cfg, saved);
        cfg.tools           = { ...DEFAULT_CONFIG.tools,           ...(saved.tools           || {}) };
        cfg.memory          = { ...DEFAULT_CONFIG.memory,          ...(saved.memory          || {}) };
        cfg.knowledgeBase   = { ...DEFAULT_CONFIG.knowledgeBase,   ...(saved.knowledgeBase   || {}) };
        cfg.webSearch       = { ...DEFAULT_CONFIG.webSearch,       ...(saved.webSearch       || {}) };
        cfg.apiIntegrations = saved.apiIntegrations || [];
        return cfg;
      } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
    },
    save(cfg) {
      cfg.updatedAt = new Date().toISOString();
      localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(cfg));
    },
    reset() { localStorage.removeItem(AGENT_CONFIG_KEY); },
    isEnabled() {
      const cfg = this.get();
      return cfg.enabled && (typeof AuthSystem !== 'undefined' ? AuthSystem.isSuperAdmin() : false);
    },
  };

  // ──────────────────────────────────────────────────────────
  // Cross-session memory
  // ──────────────────────────────────────────────────────────
  const AgentMemory = {
    _load() {
      try { return JSON.parse(localStorage.getItem(AGENT_MEM_KEY)) || []; } catch { return []; }
    },
    _save(mems) { localStorage.setItem(AGENT_MEM_KEY, JSON.stringify(mems)); },

    add(key, value, tags = [], category = 'general') {
      const mems = this._load();
      const idx  = mems.findIndex(m => m.key === key);
      const entry = { key, value, tags, category, timestamp: new Date().toISOString(), source: 'agent' };
      if (idx >= 0) { mems[idx] = entry; } else { mems.push(entry); }
      this._save(mems);
      return entry;
    },

    search(query, k = 8) {
      const mems = this._load();
      if (!query) return mems.slice(-k);
      const q = query.toLowerCase();
      return mems
        .filter(m => (m.key + ' ' + m.value + ' ' + (m.tags || []).join(' ')).toLowerCase().includes(q))
        .slice(-k);
    },

    getAll()           { return this._load(); },
    getByCategory(cat) { return this._load().filter(m => m.category === cat); },

    delete(key) {
      this._save(this._load().filter(m => m.key !== key));
    },
    clear() { localStorage.removeItem(AGENT_MEM_KEY); },

    buildContextBlock(query = '') {
      const cfg = AgentConfig.get();
      if (!cfg.tools.crossMemory) return '';
      const mems = this.search(query, cfg.knowledgeBase.topK || 5);
      if (!mems.length) return '';
      const facts = mems.map(m => `• **${m.key}** [${m.category || 'general'}]: ${m.value}`).join('\n');
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
            store.createIndex('title',     'title',     { unique: false });
            store.createIndex('source',    'source',    { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
            store.createIndex('category',  'category',  { unique: false });
          }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      return this._dbPromise;
    },

    async listAll() {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readonly').objectStore(KB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => reject(req.error);
      });
    },

    async get(id) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readonly').objectStore(KB_STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });
    },

    async add(doc) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).put(doc);
        req.onsuccess = () => resolve(doc);
        req.onerror   = () => reject(req.error);
      });
    },

    async delete(id) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    },

    async clear() {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    },

    // ── Text chunking ──────────────────────────────────────
    _chunkText(text, size = 800) {
      const sentences = text.split(/(?<=[.!?])\s+/);
      const chunks = [];
      let cur = '';
      for (const s of sentences) {
        if ((cur + ' ' + s).trim().length > size && cur) {
          chunks.push(cur.trim());
          cur = s;
        } else {
          cur = (cur + ' ' + s).trim();
        }
      }
      if (cur) chunks.push(cur);
      return chunks;
    },

    // ── Similarity search ──────────────────────────────────
    async search(query, topK = 5) {
      const docs = await this.listAll();
      if (!docs.length) return [];
      const q    = query.toLowerCase();
      const qw   = new Set(q.split(/\W+/).filter(w => w.length > 2));
      const results = [];
      for (const doc of docs) {
        for (const chunk of (doc.chunks || [])) {
          const text  = (chunk.text || '').toLowerCase();
          const words = new Set(text.split(/\W+/).filter(w => w.length > 2));
          let score   = 0;
          for (const w of qw) { if (words.has(w)) score++; }
          if (score > 0) results.push({ doc, chunk, score });
        }
      }
      return results.sort((a, b) => b.score - a.score).slice(0, topK);
    },

    // ── Build context block for system prompt ──────────────
    async buildContextBlock(query = '') {
      const cfg = AgentConfig.get();
      if (!cfg.knowledgeBase.enabled) return '';
      const results = await this.search(query, cfg.knowledgeBase.topK);
      if (!results.length) return '';
      const sections = results.map(r =>
        `**[${r.doc.title}]** (${r.doc.source || 'KB'})\n${r.chunk.text}`
      ).join('\n\n---\n\n');
      return `\n\n## 📚 Knowledge Base Context\n${sections}\n`;
    },

    // ── File ingestion ─────────────────────────────────────
    async ingestFile(file, category = 'general', tags = []) {
      const cfg     = AgentConfig.get();
      const maxSize = 20 * 1024 * 1024; // 20 MB
      if (file.size > maxSize) throw new Error(`File too large (max 20MB): ${file.name}`);

      let text = '';
      const ext = file.name.split('.').pop().toLowerCase();

      if (['txt', 'md', 'csv', 'json', 'js', 'py', 'ts', 'html', 'css', 'xml', 'yaml', 'yml'].includes(ext)) {
        text = await file.text();
      } else if (ext === 'pdf') {
        text = await this._readPdf(file);
      } else {
        text = await file.text(); // best-effort for unknown types
      }

      if (!text.trim()) throw new Error('No text content found in file.');

      const chunks = this._chunkText(text, cfg.knowledgeBase.chunkSize || 800)
        .slice(0, cfg.knowledgeBase.maxChunks || 500)
        .map((t, i) => ({ id: i, text: t }));

      const doc = {
        id:        'file_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title:     file.name,
        source:    'file',
        type:      ext,
        category:  category,
        tags:      tags,
        size:      file.size,
        chunks,
        createdAt: new Date().toISOString(),
      };

      await this.add(doc);
      return doc;
    },

    // ── URL ingestion ──────────────────────────────────────
    async ingestUrl(url, category = 'general', tags = []) {
      const cfg  = AgentConfig.get();
      let html, text, title;

      try {
        const res  = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } });
        if (res.ok) {
          text  = await res.text();
          title = text.split('\n')[0]?.replace(/^#\s*/, '').trim() || url;
        }
      } catch {}

      if (!text) {
        const res = await fetch(url);
        html  = await res.text();
        const parser = new DOMParser();
        const parsed = parser.parseFromString(html, 'text/html');
        // Remove script/style
        parsed.querySelectorAll('script,style,noscript,nav,footer,aside').forEach(el => el.remove());
        text  = (parsed.body?.innerText || parsed.body?.textContent || '').replace(/\s+/g, ' ').trim();
        title = parsed.querySelector('title')?.textContent?.trim() || url;
      }

      if (!text?.trim()) throw new Error('Could not extract text from URL');

      const chunks = this._chunkText(text, cfg.knowledgeBase.chunkSize || 800)
        .slice(0, cfg.knowledgeBase.maxChunks || 500)
        .map((t, i) => ({ id: i, text: t }));

      const doc = {
        id:        'url_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title,
        source:    url,
        type:      'url',
        category,
        tags,
        chunks,
        createdAt: new Date().toISOString(),
      };

      await this.add(doc);
      return doc;
    },

    // ── PDF reading (basic — no external lib) ─────────────
    async _readPdf(file) {
      // If PDF.js is available, use it; otherwise extract visible text from raw buffer
      if (typeof pdfjsLib !== 'undefined') {
        const buf  = await file.arrayBuffer();
        const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map(item => item.str).join(' '));
        }
        return pages.join('\n\n');
      }
      // Fallback: read as text (works for text-based PDFs)
      try { return await file.text(); } catch { return ''; }
    },
  };

  // ──────────────────────────────────────────────────────────
  // Super-Agent tool definitions
  // ──────────────────────────────────────────────────────────
  const SUPER_TOOLS = [
    // ── Existing tools ────────────────────────────────────
    {
      name: 'wikipedia_search',
      description: 'Search Wikipedia for authoritative reference information on any topic, person, place, concept, or historical event.',
      schema: {
        type: 'object',
        properties: {
          topic:     { type: 'string', description: 'The topic to search on Wikipedia' },
          sentences: { type: 'number', description: 'Number of summary sentences to return (default 5)' },
        },
        required: ['topic'],
      },
    },
    {
      name: 'get_weather',
      description: 'Get current weather conditions and forecast for any location in the world.',
      schema: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City, region, or coordinates (e.g. "London", "Austin, TX", "48.8566,2.3522")' },
          format:   { type: 'string', enum: ['brief', 'full'], description: 'How much detail to return' },
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
          query: { type: 'string', description: 'Search query' },
          type:  { type: 'string', enum: ['repositories', 'code', 'users'], description: 'What to search for (default: repositories)' },
          limit: { type: 'number', description: 'Max results to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_news',
      description: 'Get the latest news headlines and articles on any topic or keyword.',
      schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'News topic or keyword' },
          count: { type: 'number', description: 'Number of articles (default 5)' },
        },
        required: ['topic'],
      },
    },
    {
      name: 'kb_search',
      description: 'Search your personal knowledge base for information from uploaded documents, notes, and ingested web pages.',
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
      description: 'Save an important fact to cross-session super-agent memory. Persists across ALL chat sessions. Use a category to organize: preferences, projects, contacts, dates, or general.',
      schema: {
        type: 'object',
        properties: {
          key:      { type: 'string', description: 'Short label for the memory' },
          value:    { type: 'string', description: 'The information to remember' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'Topic tags' },
          category: { type: 'string', enum: ['preferences', 'projects', 'contacts', 'dates', 'general'], description: 'Memory category' },
        },
        required: ['key', 'value'],
      },
    },
    {
      name: 'agent_memory_recall',
      description: 'Recall information from cross-session super-agent memory. Can filter by category.',
      schema: {
        type: 'object',
        properties: {
          query:    { type: 'string', description: 'What to look for in memory' },
          category: { type: 'string', enum: ['preferences', 'projects', 'contacts', 'dates', 'general', 'all'], description: 'Filter by category (default: all)' },
        },
        required: ['query'],
      },
    },

    // ── New tools ─────────────────────────────────────────
    {
      name: 'web_search',
      description: 'Search the live internet for current information, news, recent events, real-time data, and up-to-date facts. Use this for anything time-sensitive or not in your training data.',
      schema: {
        type: 'object',
        properties: {
          query:    { type: 'string', description: 'The search query' },
          maxResults: { type: 'number', description: 'Number of results (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'calculate',
      description: 'Evaluate a mathematical expression. Supports arithmetic, exponents, square roots, percentages, trigonometry (Math.*), and complex formulas.',
      schema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression to evaluate, e.g. "2 ** 32", "Math.sqrt(144)", "1000 * (1 + 0.05) ** 10"' },
        },
        required: ['expression'],
      },
    },
    {
      name: 'run_code',
      description: 'Run a JavaScript code snippet and return the output. Useful for data analysis, sorting, filtering, transforming data, generating lists, or any computation.',
      schema: {
        type: 'object',
        properties: {
          code:    { type: 'string', description: 'JavaScript code to execute. Use console.log() to output results.' },
          timeout: { type: 'number', description: 'Max execution time in ms (default 5000)' },
        },
        required: ['code'],
      },
    },
    {
      name: 'create_note',
      description: 'Create and save a note or document directly to the knowledge base. Use this to record research, summaries, plans, or any information that should be remembered.',
      schema: {
        type: 'object',
        properties: {
          title:    { type: 'string', description: 'Title of the note' },
          content:  { type: 'string', description: 'Full text content of the note' },
          category: { type: 'string', description: 'Category for organization (e.g. "research", "projects", "personal")' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'Tags for searchability' },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'list_kb_docs',
      description: 'List all documents currently in the knowledge base with their titles, sources, sizes, and creation dates.',
      schema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category (optional)' },
        },
      },
    },
    {
      name: 'call_integration',
      description: 'Call a configured API integration by name. Returns the response data.',
      schema: {
        type: 'object',
        properties: {
          name:    { type: 'string', description: 'Integration name as configured in Admin → Agent → Integrations' },
          method:  { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method (default GET)' },
          path:    { type: 'string', description: 'Path to append to the base endpoint (optional)' },
          body:    { type: 'object', description: 'Request body for POST/PUT/PATCH (optional)' },
          params:  { type: 'object', description: 'Query parameters (optional)' },
        },
        required: ['name'],
      },
    },
  ];

  // ──────────────────────────────────────────────────────────
  // Super-Tool executor
  // ──────────────────────────────────────────────────────────
  async function executeSuperTool(toolName, input) {
    switch (toolName) {

      // ── Wikipedia ────────────────────────────────────────
      case 'wikipedia_search': {
        const topic     = encodeURIComponent(input.topic);
        const sentences = input.sentences || 5;
        try {
          const res  = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${topic}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data.type === 'disambiguation') {
            return `"${input.topic}" is ambiguous on Wikipedia. Try a more specific term.`;
          }
          const extract = (data.extract || '').split('. ').slice(0, sentences).join('. ');
          return `**${data.title}** (Wikipedia)\n\n${extract}\n\nSource: ${data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${topic}`}`;
        } catch (e) {
          return `Wikipedia search failed for "${input.topic}": ${e.message}`;
        }
      }

      // ── Weather ──────────────────────────────────────────
      case 'get_weather': {
        try {
          const loc = encodeURIComponent(input.location);
          if (input.format === 'full') {
            const res  = await fetch(`https://wttr.in/${loc}?format=j2`);
            const data = await res.json();
            const cur  = data.current_condition?.[0];
            const area = data.nearest_area?.[0];
            const city = area?.areaName?.[0]?.value || input.location;
            const country = area?.country?.[0]?.value || '';
            return [
              `**${city}, ${country}** — Current Weather`,
              `🌡 ${cur.temp_C}°C (${cur.temp_F}°F)`,
              `☁ ${cur.weatherDesc?.[0]?.value}`,
              `💧 Humidity: ${cur.humidity}%`,
              `💨 Wind: ${cur.windspeedKmph} km/h ${cur.winddir16Point}`,
              `👁 Visibility: ${cur.visibility} km`,
              `🌡 Feels like: ${cur.FeelsLikeC}°C (${cur.FeelsLikeF}°F)`,
            ].join('\n');
          } else {
            const res  = await fetch(`https://wttr.in/${loc}?format=3`);
            return (await res.text()).trim();
          }
        } catch (e) {
          return `Weather unavailable for "${input.location}": ${e.message}`;
        }
      }

      // ── GitHub ───────────────────────────────────────────
      case 'search_github': {
        try {
          const type  = input.type || 'repositories';
          const limit = Math.min(input.limit || 5, 10);
          const q     = encodeURIComponent(input.query);
          const res   = await fetch(
            `https://api.github.com/search/${type}?q=${q}&per_page=${limit}&sort=stars`,
            { headers: { Accept: 'application/vnd.github.v3+json' } }
          );
          const data = await res.json();
          if (!data.items?.length) return `No GitHub ${type} found for "${input.query}".`;
          if (type === 'repositories') {
            return `**GitHub Repositories for "${input.query}"**\n\n` +
              data.items.map(r =>
                `• **${r.full_name}** ⭐${r.stargazers_count.toLocaleString()}\n  ${r.description || 'No description'}\n  ${r.html_url}`
              ).join('\n\n');
          } else if (type === 'users') {
            return `**GitHub Users for "${input.query}"**\n\n` +
              data.items.map(u => `• [${u.login}](${u.html_url})`).join('\n');
          }
          return JSON.stringify(data.items.slice(0, limit), null, 2);
        } catch (e) { return `GitHub search failed: ${e.message}`; }
      }

      // ── News ─────────────────────────────────────────────
      case 'get_news': {
        try {
          const cfg   = AgentConfig.get();
          const topic = encodeURIComponent(input.topic);
          const count = Math.min(input.count || 5, 10);
          const key   = cfg.webSearch?.apiKey || '';

          // Try GNews if key available
          if (key && cfg.webSearch?.provider !== 'serp') {
            const res  = await fetch(`https://gnews.io/api/v4/search?q=${topic}&max=${count}&apikey=${key}&lang=en`);
            const data = await res.json();
            const arts = data.articles || [];
            if (arts.length) {
              return `**News: "${input.topic}"**\n\n` +
                arts.map(a => `• **${a.title}** (${a.source?.name || 'unknown'})\n  ${(a.description || '').slice(0, 140)}\n  ${a.url}`).join('\n\n');
            }
          }

          // Fallback: Wikipedia current events
          const res  = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${new Date().toISOString().slice(0, 10).replace(/-/g, '/')}`);
          const data = await res.json();
          const news = (data.news || []).slice(0, count);
          if (news.length) {
            return `**Today's News (Wikipedia):**\n\n` +
              news.map(n => `• ${(n.story || '').replace(/<[^>]+>/g, '').slice(0, 200)}`).join('\n');
          }
          return `No news data available. Add a GNews/Brave API key in Admin → Agent → Web Search for live news.`;
        } catch (e) { return `News search failed: ${e.message}`; }
      }

      // ── KB search ────────────────────────────────────────
      case 'kb_search': {
        const results = await KnowledgeBase.search(input.query);
        if (!results.length) return `No knowledge base results for "${input.query}".`;
        return `**Knowledge Base: "${input.query}"**\n\n` +
          results.map(r => `**[${r.doc.title}]** (score: ${r.score})\n${r.chunk.text}`).join('\n\n---\n\n');
      }

      // ── Memory save ──────────────────────────────────────
      case 'agent_memory_save': {
        const entry = AgentMemory.add(input.key, input.value, input.tags || [], input.category || 'general');
        return `✅ Saved to super-agent memory [${entry.category}]: "${entry.key}" = "${entry.value}"`;
      }

      // ── Memory recall ────────────────────────────────────
      case 'agent_memory_recall': {
        const cat  = input.category && input.category !== 'all' ? input.category : null;
        const mems = cat ? AgentMemory.getByCategory(cat) : AgentMemory.search(input.query);
        if (!mems.length) return `No super-agent memories found for "${input.query}"${cat ? ` in category "${cat}"` : ''}.`;
        return `**Agent Memory: "${input.query}"**\n\n` +
          mems.map(m => `• **${m.key}** [${m.category || 'general'}]: ${m.value}`).join('\n');
      }

      // ── Web search (NEW) ─────────────────────────────────
      case 'web_search': {
        const cfg   = AgentConfig.get();
        const q     = encodeURIComponent(input.query);
        const n     = Math.min(input.maxResults || 5, 10);
        const prov  = cfg.webSearch?.provider || 'ddg';
        const key   = cfg.webSearch?.apiKey || '';

        try {
          // Brave Search
          if (prov === 'brave' && key) {
            const res  = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${q}&count=${n}`, {
              headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
            });
            if (!res.ok) throw new Error(`Brave Search: HTTP ${res.status}`);
            const data = await res.json();
            const hits = data.web?.results || [];
            if (!hits.length) return `No results found for "${input.query}".`;
            return `**Web Search: "${input.query}"** (Brave)\n\n` +
              hits.slice(0, n).map(h => `• **${h.title}**\n  ${h.description || ''}\n  ${h.url}`).join('\n\n');
          }

          // SerpAPI
          if (prov === 'serp' && key) {
            const res  = await fetch(`https://serpapi.com/search.json?q=${q}&num=${n}&api_key=${key}`);
            if (!res.ok) throw new Error(`SerpAPI: HTTP ${res.status}`);
            const data = await res.json();
            const hits = data.organic_results || [];
            if (!hits.length) return `No results for "${input.query}".`;
            return `**Web Search: "${input.query}"** (Google via SerpAPI)\n\n` +
              hits.slice(0, n).map(h => `• **${h.title}**\n  ${h.snippet || ''}\n  ${h.link}`).join('\n\n');
          }

          // DuckDuckGo instant answers (no key required)
          const ddgRes  = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
          const ddgData = await ddgRes.json();
          const parts   = [];
          if (ddgData.AbstractText) parts.push(`**Summary:** ${ddgData.AbstractText}\nSource: ${ddgData.AbstractURL}`);
          if (ddgData.Answer)       parts.push(`**Answer:** ${ddgData.Answer}`);
          const related = (ddgData.RelatedTopics || [])
            .filter(r => r.Text)
            .slice(0, n)
            .map(r => `• ${r.Text}`);
          if (related.length) parts.push(`**Related:**\n${related.join('\n')}`);

          if (!parts.length) return `No instant-answer results for "${input.query}". Add a Brave Search or SerpAPI key in Admin → Agent → Web Search for full web search.`;
          return `**Web Search: "${input.query}"** (DuckDuckGo)\n\n${parts.join('\n\n')}`;
        } catch (e) { return `Web search failed: ${e.message}`; }
      }

      // ── Calculator (NEW) ─────────────────────────────────
      case 'calculate': {
        try {
          const expr   = (input.expression || '').trim();
          // Security: only allow math-safe characters
          if (/[^0-9+\-*/.()%^ Math.,\s_a-zA-Z]/.test(expr)) {
            return 'Invalid expression — only math expressions are allowed.';
          }
          // eslint-disable-next-line no-new-func
          const result = Function('"use strict"; return (' + expr + ')')();
          if (typeof result === 'number') {
            const formatted = Number.isInteger(result)
              ? result.toLocaleString()
              : parseFloat(result.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 10 });
            return `**${expr}** = **${formatted}**`;
          }
          return `**${expr}** = ${JSON.stringify(result)}`;
        } catch (e) { return `Calculation error: ${e.message}`; }
      }

      // ── Code runner (NEW) ────────────────────────────────
      case 'run_code': {
        const timeout = Math.min(input.timeout || 5000, 10000);
        const code    = input.code || '';
        return new Promise(resolve => {
          const logs  = [];
          const blob  = new Blob([`
            const _log = [];
            const console = { log: (...a) => _log.push(a.map(x=>JSON.stringify(x)).join(' ')), error: (...a) => _log.push('ERROR: '+a.join(' ')), warn: (...a) => _log.push('WARN: '+a.join(' ')) };
            try {
              ${code}
              postMessage({ ok: true, logs: _log });
            } catch(e) {
              postMessage({ ok: false, error: e.message, logs: _log });
            }
          `], { type: 'text/javascript' });
          const url    = URL.createObjectURL(blob);
          const worker = new Worker(url);
          const timer  = setTimeout(() => {
            worker.terminate();
            URL.revokeObjectURL(url);
            resolve('Code execution timed out after ' + timeout + 'ms.');
          }, timeout);
          worker.onmessage = e => {
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(url);
            const { ok, error, logs: wlogs } = e.data;
            const out = wlogs?.join('\n') || '';
            if (!ok) resolve(`**Code Error:** ${error}\n\n**Output:**\n${out || '(none)'}`);
            else resolve(out || '(no output — use console.log() to return results)');
          };
          worker.onerror = e => {
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(url);
            resolve(`**Worker Error:** ${e.message}`);
          };
        });
      }

      // ── Create note (NEW) ─────────────────────────────────
      case 'create_note': {
        try {
          const cfg    = AgentConfig.get();
          const text   = input.content || '';
          const chunks = KnowledgeBase._chunkText(text, cfg.knowledgeBase.chunkSize || 800)
            .map((t, i) => ({ id: i, text: t }));
          const doc = {
            id:        'note_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            title:     input.title || 'Untitled Note',
            source:    'agent-created',
            type:      'note',
            category:  input.category || 'general',
            tags:      input.tags || [],
            chunks,
            createdAt: new Date().toISOString(),
          };
          await KnowledgeBase.add(doc);
          return `✅ Note saved to knowledge base: **"${doc.title}"** (${chunks.length} chunk${chunks.length !== 1 ? 's' : ''})`;
        } catch (e) { return `Failed to create note: ${e.message}`; }
      }

      // ── List KB docs (NEW) ────────────────────────────────
      case 'list_kb_docs': {
        try {
          let docs = await KnowledgeBase.listAll();
          if (input.category) docs = docs.filter(d => d.category === input.category);
          if (!docs.length) return 'Knowledge base is empty. Upload documents or URLs in Admin → Agent → Knowledge Base.';
          const lines = docs.map(d =>
            `• **${d.title}** [${d.type || 'unknown'}] — ${d.chunks?.length || 0} chunks${d.category ? ` · ${d.category}` : ''}${d.tags?.length ? ` · #${d.tags.join(' #')}` : ''}\n  Added: ${d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'unknown'}`
          );
          return `**Knowledge Base** (${docs.length} document${docs.length !== 1 ? 's' : ''}):\n\n${lines.join('\n\n')}`;
        } catch (e) { return `Failed to list KB docs: ${e.message}`; }
      }

      // ── Call integration (NEW) ────────────────────────────
      case 'call_integration': {
        try {
          const cfg   = AgentConfig.get();
          const integ = (cfg.apiIntegrations || []).find(
            i => i.name.toLowerCase() === (input.name || '').toLowerCase() && i.enabled
          );
          if (!integ) return `No enabled integration named "${input.name}". Check Admin → Agent → Integrations.`;

          let url       = integ.endpoint + (input.path || '');
          const method  = (input.method || 'GET').toUpperCase();
          const headers = { 'Content-Type': 'application/json' };

          if (integ.apiKey) {
            switch (integ.authType || 'bearer') {
              case 'bearer': headers['Authorization'] = `Bearer ${integ.apiKey}`; break;
              case 'key':    headers['X-API-Key']     = integ.apiKey; break;
              case 'basic':  headers['Authorization'] = `Basic ${integ.apiKey}`; break;
              case 'query':  /* handled in URL below */                           break;
            }
            if (integ.authType === 'query') {
              const sep = url.includes('?') ? '&' : '?';
              url += `${sep}api_key=${encodeURIComponent(integ.apiKey)}`;
            }
          }

          const opts = { method, headers };
          if (['POST', 'PUT', 'PATCH'].includes(method) && input.body) {
            opts.body = JSON.stringify(input.body);
          }
          if (input.params) {
            const qs = new URLSearchParams(input.params).toString();
            url += (url.includes('?') ? '&' : '?') + qs;
          }

          const res  = await fetch(url, opts);
          const ct   = res.headers.get('content-type') || '';
          let body;
          try { body = ct.includes('json') ? await res.json() : await res.text(); } catch { body = '(no body)'; }

          // Update lastUsed
          const updated = cfg.apiIntegrations.map(i =>
            i.id === integ.id ? { ...i, lastUsed: new Date().toISOString() } : i
          );
          AgentConfig.save({ ...cfg, apiIntegrations: updated });

          if (!res.ok) return `**${integ.name}** returned HTTP ${res.status}:\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`;
          return `**${integ.name}** (HTTP ${res.status}):\n\`\`\`json\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}\n\`\`\``;
        } catch (e) { return `Integration call failed: ${e.message}`; }
      }

      default:
        return null; // Not a super-tool — let caller handle
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
      prompt += await KnowledgeBase.buildContextBlock(userMessage);
    }

    // Tool list
    const toolMap = {
      webSearch:      `web_search (live internet — provider: ${cfg.webSearch?.provider || 'ddg'})`,
      wikipedia:      'wikipedia_search (reference info)',
      weather:        'get_weather (live weather)',
      githubSearch:   'search_github (repositories & code)',
      news:           'get_news (latest headlines)',
      knowledgeBase:  'kb_search (your personal documents)',
      crossMemory:    'agent_memory_recall / agent_memory_save (cross-session memory by category)',
      calculator:     'calculate (math expressions)',
      codeRunner:     'run_code (JavaScript sandbox)',
      imageAnalysis:  'analyze_image (vision — analyze images)',
      createNote:     'create_note (save notes to KB)',
      listKbDocs:     'list_kb_docs (list all KB documents)',
    };

    if (cfg.tools.apiIntegrations && cfg.apiIntegrations?.length) {
      const names = cfg.apiIntegrations.filter(i => i.enabled).map(i => i.name).join(', ');
      if (names) toolMap['apiIntegrations'] = `call_integration (${names})`;
    }

    const enabled = Object.entries(cfg.tools)
      .filter(([, v]) => v)
      .map(([k]) => toolMap[k])
      .filter(Boolean);

    if (enabled.length) {
      prompt += `\n\n## Available Tools\n${enabled.map(t => `- ${t}`).join('\n')}`;
    }

    return prompt;
  }

  // ──────────────────────────────────────────────────────────
  // Get enabled super-tools
  // ──────────────────────────────────────────────────────────
  function getSuperTools() {
    const cfg = AgentConfig.get();
    const map = {
      wikipedia:      ['wikipedia_search'],
      weather:        ['get_weather'],
      githubSearch:   ['search_github'],
      news:           ['get_news'],
      knowledgeBase:  ['kb_search'],
      crossMemory:    ['agent_memory_save', 'agent_memory_recall'],
      webSearch:      ['web_search'],
      calculator:     ['calculate'],
      codeRunner:     ['run_code'],
      createNote:     ['create_note'],
      listKbDocs:     ['list_kb_docs'],
      apiIntegrations:['call_integration'],
    };
    const enabled = new Set();
    for (const [key, toolNames] of Object.entries(map)) {
      if (cfg.tools[key]) [].concat(toolNames).forEach(t => enabled.add(t));
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
