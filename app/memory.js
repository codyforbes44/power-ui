/* ============================================================
   CLAUDE POWER UI v2 — Workspace + Memory System
   ============================================================ */

const MemorySystem = (() => {

  const WS_KEY  = 'cpu_workspaces';
  const MEM_KEY = 'cpu_memories';

  // ────────────────────────────────────────────────────────
  // Internal storage helpers
  // ────────────────────────────────────────────────────────
  function loadWS() {
    try { return JSON.parse(localStorage.getItem(WS_KEY)) || []; } catch { return []; }
  }
  function saveWS(arr) { localStorage.setItem(WS_KEY, JSON.stringify(arr)); }

  function loadMem() {
    try { return JSON.parse(localStorage.getItem(MEM_KEY)) || []; } catch { return []; }
  }
  function saveMem(arr) { localStorage.setItem(MEM_KEY, JSON.stringify(arr)); }

  function uid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36); }

  // ────────────────────────────────────────────────────────
  // Workspace Manager
  // ────────────────────────────────────────────────────────
  const workspaces = {

    list() { return loadWS(); },

    get(id) { return loadWS().find(w => w.id === id) || null; },

    getActive() {
      const all = loadWS();
      return all.find(w => w.active) || all[0] || null;
    },

    setActive(id) {
      const all = loadWS().map(w => ({ ...w, active: w.id === id }));
      saveWS(all);
    },

    create(name = 'Untitled Workspace') {
      const all = loadWS();
      const ws = {
        id: uid(),
        name,
        active: all.length === 0,
        systemPromptPrefix: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      all.push(ws);
      saveWS(all);
      return ws;
    },

    update(id, patch) {
      const all = loadWS().map(w => w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w);
      saveWS(all);
    },

    delete(id) {
      const all = loadWS().filter(w => w.id !== id);
      // Make first remaining workspace active
      if (all.length > 0 && !all.some(w => w.active)) all[0].active = true;
      saveWS(all);
      // Delete associated memories
      saveMem(loadMem().filter(m => m.workspaceId !== id));
    },

    ensureDefault() {
      const all = loadWS();
      if (all.length === 0) {
        this.create('Default');
      }
    },
  };

  // ────────────────────────────────────────────────────────
  // TF-IDF keyword scorer
  // ────────────────────────────────────────────────────────
  function tokenize(str) {
    return (str || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  function scoreMemory(memory, queryTokens) {
    if (!queryTokens.length) return 0;
    const docTokens = tokenize(`${memory.key} ${memory.value} ${(memory.tags || []).join(' ')}`);
    const docSet = new Set(docTokens);
    let hits = 0;
    for (const qt of queryTokens) {
      if (docSet.has(qt)) hits++;
      // Partial match
      else if (docTokens.some(dt => dt.includes(qt) || qt.includes(dt))) hits += 0.5;
    }
    return hits / queryTokens.length;
  }

  // ────────────────────────────────────────────────────────
  // Memory Store
  // ────────────────────────────────────────────────────────
  const memories = {

    list(workspaceId) {
      return loadMem().filter(m => m.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    add(workspaceId, { key, value, tags = [], source = 'manual' }) {
      const all = loadMem();
      const entry = {
        id: uid(),
        workspaceId,
        key: String(key).trim(),
        value: String(value).trim(),
        tags,
        source,
        createdAt: Date.now(),
        useCount: 0,
      };
      all.push(entry);
      saveMem(all);
      return entry;
    },

    update(id, patch) {
      const all = loadMem().map(m => m.id === id ? { ...m, ...patch } : m);
      saveMem(all);
    },

    delete(id) {
      saveMem(loadMem().filter(m => m.id !== id));
    },

    /**
     * Search memories by relevance to query.
     * Returns top N entries scored by keyword overlap.
     */
    search(workspaceId, query, topN = 5) {
      const queryTokens = tokenize(query);
      if (!queryTokens.length) return this.list(workspaceId).slice(0, topN);

      const all = this.list(workspaceId);
      const scored = all
        .map(m => ({ m, score: scoreMemory(m, queryTokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

      // Increment use count for returned memories
      const results = scored.slice(0, topN).map(({ m }) => m);
      results.forEach(m => this.update(m.id, { useCount: (m.useCount || 0) + 1 }));

      return results;
    },

    /**
     * Build a memory context block to inject into system prompt.
     * Returns a string or empty string if no relevant memories.
     */
    buildContext(workspaceId, query) {
      const relevant = this.search(workspaceId, query, 6);
      if (!relevant.length) return '';

      const lines = relevant.map(m => `- **${m.key}**: ${m.value}`);
      return `## Remembered Context\n${lines.join('\n')}\n`;
    },

    /**
     * Auto-extract key facts from a conversation using Claude API.
     * @param {string} apiKey - Anthropic API key
     * @param {Array} messages - [{role, content}]
     * @returns {Promise<Array>} - [{key, value}]
     */
    async autoExtract(apiKey, messages, workspaceId) {
      if (!apiKey || !messages.length) return [];

      const transcript = messages
        .slice(-20) // last 20 messages only
        .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
        .join('\n\n');

      const extractPrompt = `Extract 3-5 concise, reusable facts from this conversation that would be useful to remember for future sessions. Focus on: project names, tech stack decisions, user preferences, key constraints, and explicit facts stated.

Return ONLY a JSON array like:
[{"key": "short label", "value": "fact to remember"}]

Conversation:
${transcript}`;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-3-5',
            max_tokens: 512,
            messages: [{ role: 'user', content: extractPrompt }],
          }),
        });

        if (!response.ok) return [];
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        const match = text.match(/\[.*\]/s);
        if (!match) return [];
        const facts = JSON.parse(match[0]);
        return Array.isArray(facts) ? facts : [];
      } catch {
        return [];
      }
    },
  };

  // ────────────────────────────────────────────────────────
  // Boot / migration
  // ────────────────────────────────────────────────────────
  function init() {
    workspaces.ensureDefault();
  }

  return { workspaces, memories, init };
})();
