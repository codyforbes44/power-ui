/**
 * agent.js — Super Admin Agent System (v2)
 * Provides: AgentConfig, KnowledgeBase (IndexedDB), tools, and cross-session memory.
 * Access restricted to isSuperAdmin() users only.
 *
 * New in v2:
 *   Tools:   web_search, calculate, run_code, create_note, list_kb_docs
 *   Config:  webSearchProvider, webSearchApiKey, memoryCategories, apiIntegrations[]
 */

import { AuthSystem, ApiKeyVault } from './auth.js';

export const SuperAgent = (() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────
  const AGENT_CONFIG_KEY = 'async_agent_v1';
  const KB_DB_NAME       = 'async_kb_v1';
  const KB_STORE         = 'documents';
  const AGENT_MEM_KEY    = 'async_agent_memories_v1';

  // ──────────────────────────────────────────────────────────
  // Storage-full notifier
  // ──────────────────────────────────────────────────────────
  function _warnStorageFull() {
    const msg = 'Save failed: storage full';
    try {
      if (typeof AdminApp !== 'undefined' && AdminApp?.toast) AdminApp.toast(msg, 'error');
      else if (typeof alert === 'function') alert(msg);
    } catch { /* nothing we can do */ }
  }

  // ──────────────────────────────────────────────────────────
  // Safe math expression evaluator (no eval / no Function)
  // Tokenizer + recursive-descent parser. Only numbers, the
  // operators + - * / % ^ (and **), parens, commas, and an
  // explicit allowlist of Math.* functions/constants are accepted.
  // Any other identifier (fetch, document, String, constructor,
  // window, globalThis, self, import, …) is rejected.
  // ──────────────────────────────────────────────────────────
  // EVALUATOR-START
  function evalMathExpression(input) {
    const expr = String(input == null ? '' : input).trim();
    if (!expr) throw new Error('Empty expression');
    if (expr.length > 500) throw new Error('Expression too long');

    const MATH_FUNCS = new Set([
      'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'sign',
      'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
      'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
      'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
      'atan2', 'pow', 'max', 'min', 'hypot',
    ]);
    const MATH_CONSTS = {
      PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10,
      LOG2E: Math.LOG2E, LOG10E: Math.LOG10E, SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2,
    };

    // ── Tokenize ──────────────────────────────────────────
    const numRe = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
    const idRe  = /^[A-Za-z][A-Za-z0-9_.]*/;
    const tokens = [];
    let i = 0;
    const n = expr.length;
    while (i < n) {
      const c = expr[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if ((c >= '0' && c <= '9') || (c === '.' && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
        const m = expr.slice(i).match(numRe);
        if (!m) throw new Error(`Invalid number at position ${i}`);
        tokens.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
        const name = expr.slice(i).match(idRe)[0];
        i += name.length;
        if (!/^Math\.[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unknown identifier: ${name}`);
        const suffix = name.slice(5);
        if (MATH_FUNCS.has(suffix)) tokens.push({ t: 'func', v: suffix });
        else if (Object.prototype.hasOwnProperty.call(MATH_CONSTS, suffix)) tokens.push({ t: 'num', v: MATH_CONSTS[suffix] });
        else throw new Error(`Unknown identifier: ${name}`);
        continue;
      }
      if (c === '*' && expr[i + 1] === '*') { tokens.push({ t: 'op', v: '^' }); i += 2; continue; }
      if ('+-*/%^(),'.includes(c)) { tokens.push({ t: 'op', v: c }); i += 1; continue; }
      throw new Error(`Unexpected character: "${c}"`);
    }
    if (!tokens.length) throw new Error('Empty expression');

    // ── Parse (recursive descent) ─────────────────────────
    let p = 0;
    const peek = () => tokens[p];
    const eat  = () => tokens[p++];

    function parseExpr() {   // + -
      let left = parseTerm();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = eat().v;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    function parseTerm() {   // * / %
      let left = parseFactor();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
        const op = eat().v;
        const right = parseFactor();
        left = op === '*' ? left * right : op === '/' ? left / right : left % right;
      }
      return left;
    }
    function parseFactor() { // ^ (right-associative), after unary
      const base = parseUnary();
      if (peek() && peek().t === 'op' && peek().v === '^') {
        eat();
        return Math.pow(base, parseFactor());
      }
      return base;
    }
    function parseUnary() {
      const tk = peek();
      if (tk && tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        eat();
        const val = parseUnary();
        return tk.v === '-' ? -val : val;
      }
      return parsePrimary();
    }
    function parsePrimary() {
      const tk = eat();
      if (!tk) throw new Error('Unexpected end of expression');
      if (tk.t === 'num') return tk.v;
      if (tk.t === 'func') {
        if (!peek() || peek().v !== '(') throw new Error(`Expected ( after Math.${tk.v}`);
        eat(); // (
        const args = [];
        if (peek() && peek().v !== ')') {
          args.push(parseExpr());
          while (peek() && peek().v === ',') { eat(); args.push(parseExpr()); }
        }
        if (!peek() || peek().v !== ')') throw new Error('Expected ) after arguments');
        eat(); // )
        return Math[tk.v](...args);
      }
      if (tk.t === 'op' && tk.v === '(') {
        const val = parseExpr();
        if (!peek() || peek().v !== ')') throw new Error('Expected )');
        eat(); // )
        return val;
      }
      throw new Error(`Unexpected token: ${tk.v}`);
    }

    const result = parseExpr();
    if (p < tokens.length) throw new Error(`Unexpected trailing input near "${peek().v}"`);
    if (typeof result !== 'number') throw new Error('Expression did not evaluate to a number');
    return result;
  }
  // EVALUATOR-END

  // ──────────────────────────────────────────────────────────
  // Default config
  // ──────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    enabled:      true,
    persona:      'Aria',
    avatarEmoji:  '✦',
    activePresetId: 'default',
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
      imageGen:       true,
      calculator:     true,   // NEW
      codeRunner:     false,  // NEW (off by default — runs JS)
      createNote:     true,   // NEW
      listKbDocs:     true,   // NEW
      apiIntegrations:false,  // NEW (enabled when integrations configured)
      youtube:        true,
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

    // ── Voice / Agent ──────────────────────────────────────
    voice: {
      elevenlabsAgentId: 'agent_4501kx66fjttf7gvkdh772xm3vcf',
    },

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // ──────────────────────────────────────────────────────────
  // AgentConfig
  // ──────────────────────────────────────────────────────────
  // Tracks whether the one-time plaintext→vault migration has run this session.
  let _keysMigrated = false;

  /** Build a copy of cfg with all raw key material stripped for at-rest storage. */
  function _stripKeys(cfg) {
    const out = JSON.parse(JSON.stringify(cfg));
    if (out.webSearch) {
      out.webSearch.hasKey = !!(out.webSearch.apiKey || out.webSearch.hasKey);
      delete out.webSearch.apiKey;
    }
    out.apiIntegrations = (out.apiIntegrations || []).map(i => {
      const { apiKey, ...rest } = i;
      return { ...rest, hasKey: !!(apiKey || i.hasKey) };
    });
    return out;
  }

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
        cfg.voice           = { ...DEFAULT_CONFIG.voice,           ...(saved.voice           || {}) };
        cfg.apiIntegrations = saved.apiIntegrations || [];
        return cfg;
      } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
    },
    /**
     * Async config accessor for the agent runtime: returns the merged config
     * with integration/web-search keys rehydrated from the encrypted vault.
     * Runs the one-time plaintext migration first. If the vault is locked,
     * keys are left empty (callers surface the lock error at use time).
     */
    async load() {
      await this.migrate();
      const cfg = this.get();
      try {
        cfg.webSearch.apiKey = await ApiKeyVault.getWebSearchKey();
      } catch { cfg.webSearch.apiKey = ''; }
      for (const integ of cfg.apiIntegrations) {
        try { integ.apiKey = await ApiKeyVault.getIntegrationKey(integ.id); }
        catch { integ.apiKey = ''; }
      }
      return cfg;
    },
    save(cfg) {
      cfg.updatedAt = new Date().toISOString();
      // Never persist raw key material in the plaintext config blob.
      try {
        localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(_stripKeys(cfg)));
      } catch { _warnStorageFull(); }

      // Push config to Firestore in background
      if (typeof window.db !== 'undefined' && typeof AuthSystem !== 'undefined') {
        const session = AuthSystem.getCurrentSession();
        const uid = session && session.userId;
        if (uid) {
          window.db.collection('users').doc(uid).collection('agent_config').doc('current').set({
            config: _stripKeys(cfg),
            updatedAt: new Date().toISOString()
          }).catch(e => console.warn('CloudSync: Config save failed', e));
        }
      }
    },
    /**
     * One-time migration: move any plaintext keys left in the legacy config
     * blob into the encrypted vault, then strip them from the blob.
     * No-op if the vault is locked (retried on next call).
     */
    async migrate() {
      if (_keysMigrated) return;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(AGENT_CONFIG_KEY) || 'null'); }
      catch { saved = null; }
      if (!saved) { _keysMigrated = true; return; }

      const wsKey   = saved.webSearch?.apiKey || '';
      const intKeys = (saved.apiIntegrations || []).filter(i => i.apiKey).map(i => [i.id, i.apiKey]);
      if (!wsKey && !intKeys.length) { _keysMigrated = true; return; }

      try {
        if (wsKey) await ApiKeyVault.setWebSearchKey(wsKey);
        for (const [id, k] of intKeys) await ApiKeyVault.setIntegrationKey(id, k);
      } catch {
        // Vault locked — leave blob untouched and retry later.
        return;
      }
      // Re-persist the blob with keys stripped.
      this.save(this.get());
      _keysMigrated = true;
      console.log('AgentConfig: migrated plaintext agent keys to AES-GCM vault ✓');
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
    _save(mems) {
      try { localStorage.setItem(AGENT_MEM_KEY, JSON.stringify(mems)); }
      catch { _warnStorageFull(); }

      // Push memories to Firestore in background
      if (typeof window.db !== 'undefined' && typeof AuthSystem !== 'undefined') {
        const session = AuthSystem.getCurrentSession();
        const uid = session && session.userId;
        if (uid) {
          window.db.collection('users').doc(uid).collection('memory').doc('current').set({
            memories: mems,
            updatedAt: new Date().toISOString()
          }).catch(e => console.warn('CloudSync: Memory save failed', e));
        }
      }
    },

    add(key, value, tags = [], category = 'general') {
      const mems = this._load();
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      const idx  = mems.findIndex(m => m.key === key && (m.presetId || 'custom') === activePresetId);
      const entry = { key, value, tags, category, presetId: activePresetId, timestamp: new Date().toISOString(), source: 'agent' };
      if (idx >= 0) { mems[idx] = entry; } else { mems.push(entry); }
      this._save(mems);
      return entry;
    },

    search(query, k = 8) {
      const mems = this._load();
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      const filtered = mems.filter(m => (m.presetId || 'custom') === activePresetId);
      if (!query) return filtered.slice(-k);
      const q = query.toLowerCase();
      const qw = q.split(/\W+/).filter(w => w.length > 2);
      if (!qw.length) return filtered.slice(-k);

      const scored = filtered.map(m => {
        const text = (m.key + ' ' + m.value + ' ' + (m.tags || []).join(' ')).toLowerCase();
        let score = 0;
        if (m.key && q.includes(m.key.toLowerCase())) {
          score += 10;
        }
        for (const w of qw) {
          if (text.includes(w)) score++;
        }
        return { m, score };
      });

      return scored
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.m)
        .slice(0, k);
    },

    getAll()           {
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      return this._load().filter(m => (m.presetId || 'custom') === activePresetId);
    },
    getByCategory(cat) {
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      return this._load().filter(m => m.category === cat && (m.presetId || 'custom') === activePresetId);
    },

    delete(key) {
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      this._save(this._load().filter(m => !(m.key === key && (m.presetId || 'custom') === activePresetId)));
    },
    clear() {
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      this._save(this._load().filter(m => (m.presetId || 'custom') !== activePresetId));
    },

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
        req.onerror   = e => { this._dbPromise = null; reject(e.target.error); };
        req.onblocked = () => { this._dbPromise = null; reject(new Error('IndexedDB open blocked — close other tabs using this app and retry.')); };
      });
      return this._dbPromise;
    },

    async listAll() {
      const db = await this._getDB();
      const all = await new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readonly').objectStore(KB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => reject(req.error);
      });
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      return all.filter(d => (d.presetId || 'custom') === activePresetId);
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
      if (!doc.presetId) {
        doc.presetId = AgentConfig.get().activePresetId || 'custom';
      }
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).put(doc);
        req.onsuccess = () => resolve(doc);
        req.onerror   = () => reject(req.error);
      });

      // Push doc to Firestore in background
      if (typeof window.db !== 'undefined' && typeof AuthSystem !== 'undefined') {
        const session = AuthSystem.getCurrentSession();
        const uid = session && session.userId;
        if (uid) {
          window.db.collection('users').doc(uid).collection('kb_documents').doc(doc.id).set({
            ...doc,
            updatedAt: new Date().toISOString()
          }).catch(e => console.warn('CloudSync: KB doc save failed', e));
        }
      }
      return doc;
    },

    async delete(id) {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readwrite').objectStore(KB_STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });

      // Delete doc from Firestore in background
      if (typeof window.db !== 'undefined' && typeof AuthSystem !== 'undefined') {
        const session = AuthSystem.getCurrentSession();
        const uid = session && session.userId;
        if (uid) {
          window.db.collection('users').doc(uid).collection('kb_documents').doc(id).delete()
            .catch(e => console.warn('CloudSync: KB doc delete failed', e));
        }
      }
    },

    async clear() {
      const db = await this._getDB();
      const activePresetId = AgentConfig.get().activePresetId || 'custom';
      const all = await new Promise((resolve, reject) => {
        const req = db.transaction(KB_STORE, 'readonly').objectStore(KB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => reject(req.error);
      });
      const toDelete = all.filter(d => (d.presetId || 'custom') === activePresetId);
      
      const tx = db.transaction(KB_STORE, 'readwrite');
      const store = tx.objectStore(KB_STORE);
      for (const d of toDelete) {
        store.delete(d.id);
      }
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
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
      name: 'generate_image',
      description: 'Generate an image or video from a detailed text description. If the user provided an image and asks you to animate it, create a video from it, or do style transfer/image-to-image, pass the image URL as image_url.',
      schema: {
        type: 'object',
        properties: {
          prompt:   { type: 'string', description: 'Detailed visual description of the image or video to generate' },
          size:     { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image/video dimensions (default 1024x1024)' },
          provider: { type: 'string', enum: ['bfl', 'fal', 'replicate', 'novita', 'comfyui'], description: 'Image/video provider (default: user setting)' },
          model:    { type: 'string', description: 'Specific model ID to use (optional)' },
          image_url: { type: 'string', description: 'Optional reference image URL (for image-to-image or image-to-video generation)' }
        },
        required: ['prompt'],
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
    {
      name: 'youtube_search_play',
      description: 'Search for a YouTube video and render the interactive player in the chat.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'YouTube video title, keywords, or full URL to search and play.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'youtube_create_playlist',
      description: 'Create a new YouTube playlist with the specified videos using your cookies.',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the playlist.' },
          video_ids: { type: 'array', items: { type: 'string' }, description: 'Array of YouTube video IDs or URLs to add to the playlist.' },
        },
        required: ['title', 'video_ids'],
      },
    },
  ];

  // ──────────────────────────────────────────────────────────
  // Super-Tool executor
  // ──────────────────────────────────────────────────────────
  async function executeSuperTool(toolName, input) {
    // Ensure any legacy plaintext keys are migrated into the vault before
    // any tool tries to read a key.
    try { await AgentConfig.migrate(); } catch {}
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
          const count = Math.min(input.count || 5, 10);
          let key = '';
          try { key = await ApiKeyVault.getWebSearchKey(); } catch {}
          const PROXY = '/.netlify/functions/proxy';

          // Try GNews via proxy (avoids CORS)
          if (key && cfg.webSearch?.provider !== 'serp') {
            try {
              const res  = await fetch(PROXY, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  provider: 'gnews',
                  path:     '/',
                  apiKey:   key,
                  payload:  { topic: input.topic, count, lang: 'en' },
                }),
              });
              const data = await res.json();
              const arts = data.articles || [];
              if (arts.length) {
                return `**News: "${input.topic}"**\n\n` +
                  arts.map(a => `• **${a.title}** (${a.source?.name || 'unknown'})\n  ${(a.description || '').slice(0, 140)}\n  ${a.url}`).join('\n\n');
              }
            } catch {}
          }

          // Fallback: Wikipedia current events (Wikipedia has open CORS headers)
          try {
            const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
            const res   = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${date}`);
            const data  = await res.json();
            const news  = (data.news || []).slice(0, count);
            if (news.length) {
              return `**Today's News (Wikipedia):**\n\n` +
                news.map(n => `• ${(n.story || '').replace(/<[^>]+>/g, '').slice(0, 200)}`).join('\n');
            }
          } catch {}

          return `No news data available. Add a GNews API key in Admin → Agent → Web Search for live news.`;
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

      // ── Web search ────────────────────────────────────────
      // All providers routed through Netlify proxy to avoid CORS
      case 'web_search': {
        const cfg  = AgentConfig.get();
        const prov = cfg.webSearch?.provider || 'ddg';
        let key = '';
        if (prov !== 'ddg') {
          try { key = await ApiKeyVault.getWebSearchKey(); }
          catch (e) { return `Web search unavailable: ${e.message}`; }
        }
        const n    = Math.min(input.maxResults || 5, 10);
        const PROXY = '/.netlify/functions/proxy';

        try {
          // ── Brave Search (via proxy) ───────────────────────
          if (prov === 'brave' && key) {
            const res  = await fetch(PROXY, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                provider: 'web_search',
                path:     '/',
                apiKey:   key,
                payload:  { query: input.query, searchProvider: 'brave', maxResults: n },
              }),
            });
            if (!res.ok) throw new Error(`Proxy error: HTTP ${res.status}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const hits = data.web?.results || [];
            if (!hits.length) return `No Brave Search results for "${input.query}".`;
            return `**Web Search: "${input.query}"** (Brave)\n\n` +
              hits.slice(0, n).map(h => `• **${h.title}**\n  ${h.description || ''}\n  ${h.url}`).join('\n\n');
          }

          // ── SerpAPI (via proxy) ───────────────────────────
          if (prov === 'serp' && key) {
            const res  = await fetch(PROXY, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                provider: 'web_search',
                path:     '/',
                apiKey:   key,
                payload:  { query: input.query, searchProvider: 'serp', maxResults: n },
              }),
            });
            if (!res.ok) throw new Error(`Proxy error: HTTP ${res.status}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const hits = data.organic_results || [];
            if (!hits.length) return `No SerpAPI results for "${input.query}".`;
            return `**Web Search: "${input.query}"** (Google via SerpAPI)\n\n` +
              hits.slice(0, n).map(h => `• **${h.title}**\n  ${h.snippet || ''}\n  ${h.link}`).join('\n\n');
          }

          // ── DuckDuckGo via proxy (no key) ─────────────────
          // Use existing ddg proxy handler — same route ApiRouter.webSearch() uses
          const ddgRes  = await fetch(PROXY, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              provider: 'ddg',
              path:     '/',
              apiKey:   '',
              payload:  { query: input.query },
            }),
          });
          if (!ddgRes.ok) throw new Error(`DDG proxy error: HTTP ${ddgRes.status}`);
          const ddgData = await ddgRes.json();
          const parts   = [];
          if (ddgData.AbstractText) parts.push(`**Summary:** ${ddgData.AbstractText}\nSource: ${ddgData.AbstractURL}`);
          if (ddgData.Answer)       parts.push(`**Answer:** ${ddgData.Answer}`);
          const related = (ddgData.RelatedTopics || [])
            .filter(r => r.Text)
            .slice(0, n)
            .map(r => `• ${r.Text}`);
          if (related.length) parts.push(`**Related:**\n${related.join('\n')}`);

          if (!parts.length) return `No instant-answer results for "${input.query}".\n\n💡 Add a Brave Search key in Admin → Super Admin Agent → Web Search for full results.`;
          return `**Web Search: "${input.query}"** (DuckDuckGo)\n\n${parts.join('\n\n')}`;
        } catch (e) { return `Web search failed: ${e.message}`; }
      }

      // ── Calculator (NEW) ─────────────────────────────────
      case 'calculate': {
        try {
          const expr   = (input.expression || '').trim();
          const result = evalMathExpression(expr);
          const formatted = Number.isInteger(result)
            ? result.toLocaleString()
            : parseFloat(result.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 10 });
          return `**${expr}** = **${formatted}**`;
        } catch (e) { return `Calculation error: ${e.message}`; }
      }

      // ── Image Generation ──────────────────────────────────────
      case 'generate_image': {
        const { ImageRouter } = await import('./image-router.js');
        const settings = JSON.parse(localStorage.getItem('cpu_settings') || '{}');
        const imgSettings = settings.imageGen || {};
        const provider = input.provider || imgSettings.provider || ImageRouter.DEFAULTS.provider;
        const keys = (await ApiKeyVault.load()) || {};
        const ariaKeys = (await ApiKeyVault.loadAria()) || {};
        const apiKey = ariaKeys[provider] || keys[provider] || imgSettings.apiKey || '';
        const [w, h] = (input.size || '1024x1024').split('x').map(Number);
        
        const model = input.model || (provider === imgSettings.provider && imgSettings.model 
          ? imgSettings.model 
          : provider === ImageRouter.DEFAULTS.provider
            ? ImageRouter.DEFAULTS.model
            : ImageRouter.MODELS[provider]?.[0]?.id);

        let imageUrl = input.image_url || undefined;
        if (imageUrl === 'Attached base64 image' || (!imageUrl && localStorage.getItem('imagine_temp_image_url'))) {
          imageUrl = localStorage.getItem('imagine_temp_image_url') || undefined;
        }

        if (provider !== 'comfyui' && !apiKey) {
          return `⚠️ No API key configured for image provider "${provider}". Add it in Settings → Image Generation.`;
        }
        try {
          const result = await ImageRouter.generate(input.prompt, {
            provider, model, width: w || 1024, height: h || 1024,
            apiKey, comfyUrl: imgSettings.comfyUrl || 'http://127.0.0.1:8188',
            image_url: imageUrl
          });
          const imgSrc = result.dataUrl || result.url;
          return `__TOOL_IMAGE__:${JSON.stringify({
            src: imgSrc, prompt: input.prompt,
            provider: result.provider, model: result.model,
            width: result.width, height: result.height, seed: result.seed,
            timingS: (result.timingMs / 1000).toFixed(1),
            isVideo: result.isVideo
          })}`;
        } catch (e) {
          return `⚠️ Image generation failed: ${e.message}`;
        }
      }

      // ── YouTube Search & Play ─────────────────────────────
      case 'youtube_search_play': {
        const query = (input.query || '').trim();
        if (!query) return '✕ No query specified.';
        try {
          const keys = await ApiKeyVault.load() || {};
          const ytKey = keys.youtube;
          if (!ytKey) {
            return '✕ YouTube API Key is not configured. Please add it in settings.';
          }

          // Helper to extract YouTube video ID
          function getYoutubeId(url) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
          }

          let videoId = getYoutubeId(query);
          let title = query;
          if (!videoId && query.length === 11 && !query.includes('/') && !query.includes(' ')) {
            videoId = query;
          }

          if (!videoId) {
            const res = await fetch('/.netlify/functions/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider: 'youtube',
                path: '/search',
                apiKey: '',
                queryParams: {
                  part: 'snippet',
                  q: query,
                  type: 'video',
                  maxResults: '1',
                  key: ytKey
                },
                method: 'GET',
                payload: {}
              })
            });
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              throw new Error(`YouTube API returned ${res.status}: ${errText}`);
            }
            const data = await res.json();
            if (!data.items || data.items.length === 0) {
              throw new Error('No videos found for that query.');
            }
            videoId = data.items[0].id.videoId;
            title = data.items[0].snippet.title;
          }

          return `Here is the video you requested:\n\n[youtube-embed:${videoId}]`;
        } catch (e) { return `✕ YouTube search failed: ${e.message}`; }
      }

      // ── YouTube Create Playlist ────────────────────────────
      case 'youtube_create_playlist': {
        const title = (input.title || '').trim();
        const rawVideoIds = input.video_ids || [];
        if (!title) return '✕ No playlist title specified.';
        if (!rawVideoIds.length) return '✕ No video IDs or URLs specified.';

        try {
          const keys = await ApiKeyVault.load() || {};
          const cookies = keys.youtube_cookies;
          const apiKey = keys.youtube;
          if (!cookies) {
            return '✕ YouTube Cookies are not configured. Please add them in settings.';
          }

          function getYoutubeId(url) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
          }

          const videoIds = rawVideoIds.map(vid => {
            const clean = vid.trim();
            return getYoutubeId(clean) || (clean.length === 11 ? clean : null);
          }).filter(Boolean);

          if (!videoIds.length) {
            return '✕ No valid YouTube video IDs or URLs parsed.';
          }

          const ytApiKey = apiKey || 'AIzaSyAO-1k1212879817298712891';
          const res = await fetch('/.netlify/functions/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'youtube_innertube',
              path: `/youtubei/v1/playlist/create?key=${ytApiKey}`,
              apiKey: cookies,
              method: 'POST',
              payload: {
                context: {
                  client: {
                    clientName: 'WEB',
                    clientVersion: '2.20240101.00.00'
                  }
                },
                title: title,
                videoIds: videoIds
              }
            })
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Playlist creation failed (${res.status}): ${errText}`);
          }
          const data = await res.json();
          if (data.playlistId) {
            return `✅ Playlist **${title}** created successfully! View at: https://www.youtube.com/playlist?list=${data.playlistId}`;
          } else if (data.error) {
            throw new Error(data.error.message || 'Unknown YouTube Innertube error');
          } else {
            throw new Error('Invalid response from YouTube: ' + JSON.stringify(data));
          }
        } catch (e) { return `✕ YouTube playlist creation failed: ${e.message}`; }
      }

      // ── Code runner (NEW) ────────────────────────────────
      case 'run_code': {
        const timeout = Math.min(input.timeout || 5000, 10000);
        const code    = input.code || '';
        return new Promise(resolve => {
          const logs  = [];
          const blob  = new Blob([`
            self.fetch = self.XMLHttpRequest = self.WebSocket = self.EventSource = self.importScripts = undefined;
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

          // Read the secret from the encrypted vault at call time.
          let apiKey = '';
          try { apiKey = await ApiKeyVault.getIntegrationKey(integ.id); }
          catch (e) { return `Integration "${integ.name}" call failed: ${e.message}`; }

          if (apiKey) {
            switch (integ.authType || 'bearer') {
              case 'bearer': headers['Authorization'] = `Bearer ${apiKey}`; break;
              case 'key':    headers['X-API-Key']     = apiKey; break;
              case 'basic':  headers['Authorization'] = `Basic ${apiKey}`; break;
              case 'query':  /* handled in URL below */                     break;
            }
            if (integ.authType === 'query') {
              const sep = url.includes('?') ? '&' : '?';
              url += `${sep}api_key=${encodeURIComponent(apiKey)}`;
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
      imageGen:       ['generate_image'],
      webSearch:      ['web_search'],
      calculator:     ['calculate'],
      codeRunner:     ['run_code'],
      createNote:     ['create_note'],
      listKbDocs:     ['list_kb_docs'],
      apiIntegrations:['call_integration'],
      youtube:        ['youtube_search_play', 'youtube_create_playlist'],
    };
    const enabled = new Set();
    for (const [key, toolNames] of Object.entries(map)) {
      if (cfg.tools[key]) [].concat(toolNames).forEach(t => enabled.add(t));
    }
    return SUPER_TOOLS.filter(t => enabled.has(t.name));
  }

  // ──────────────────────────────────────────────────────────
  // Aria Session Db (Super Admin Chat Sessions)
  // ──────────────────────────────────────────────────────────
  const AriaSessionDb = (() => {
    const DB_NAME = 'async_aria_sessions';
    const DB_VERSION = 1;
    const STORE_NAME = 'sessions';
    let dbPromise = null;

    function getDB() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
      return dbPromise;
    }

    return {
      async saveSession(session) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(session);
          req.onsuccess = () => resolve();
          req.onerror = () => {
            if (req.error.name === 'QuotaExceededError') _warnStorageFull();
            reject(req.error);
          };
        });
      },
      async getSession(id) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      },
      async getAllSessions() {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      },
      async deleteSession(id) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(id);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    };
  })();

  const CloudSync = {
    async pullAll() {
      if (typeof window.db === 'undefined' || typeof AuthSystem === 'undefined') return;
      const session = AuthSystem.getCurrentSession();
      const uid = session && session.userId;
      if (!uid) return;

      console.log('☁️ [CloudSync] Pulling latest data from Firestore…');

      // 1. Config
      try {
        const configDoc = await window.db.collection('users').doc(uid).collection('agent_config').doc('current').get();
        if (configDoc.exists) {
          const cloudCfg = configDoc.data()?.config;
          if (cloudCfg) {
            localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(cloudCfg));
            console.log('   ✓ Config synced from cloud');
          }
        }
      } catch (e) { console.warn('CloudSync: config pull failed', e); }

      // 2. Memory
      try {
        const memoryDoc = await window.db.collection('users').doc(uid).collection('memory').doc('current').get();
        if (memoryDoc.exists) {
          const cloudMems = memoryDoc.data()?.memories;
          if (Array.isArray(cloudMems)) {
            localStorage.setItem(AGENT_MEM_KEY, JSON.stringify(cloudMems));
            console.log('   ✓ Memories synced from cloud');
          }
        }
      } catch (e) { console.warn('CloudSync: memory pull failed', e); }

      // 3. KB Documents
      try {
        const snapshot = await window.db.collection('users').doc(uid).collection('kb_documents').get();
        const cloudDocs = [];
        snapshot.forEach(doc => cloudDocs.push(doc.data()));

        if (cloudDocs.length > 0) {
          const db = await KnowledgeBase._getDB();
          const tx = db.transaction(KB_STORE, 'readwrite');
          const store = tx.objectStore(KB_STORE);
          
          for (const doc of cloudDocs) {
            store.put(doc);
          }
          console.log(`   ✓ Sync complete for ${cloudDocs.length} Knowledge Base docs`);
        }
      } catch (e) { console.warn('CloudSync: KB docs pull failed', e); }
      
      // Dispatch event to notify page to refresh its UI
      window.dispatchEvent(new CustomEvent('cpu:cloud-sync-complete'));
    }
  };

  // Wire auth ready rebind
  if (typeof window !== 'undefined') {
    window.addEventListener('cpu:firebase-auth-ready', () => {
      CloudSync.pullAll().catch(() => {});
    });
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────
  return {
    config:      AgentConfig,
    memory:      AgentMemory,
    kb:          KnowledgeBase,
    sessions:    AriaSessionDb,
    tools:       SUPER_TOOLS,
    calc:        evalMathExpression,
    getSuperTools,
    executeSuperTool,
    buildSuperAgentSystemPrompt,
    DEFAULT_CONFIG,
    sync:        CloudSync,
  };

})();
window.SuperAgent = SuperAgent;
