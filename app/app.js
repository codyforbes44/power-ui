/* ============================================================
   CLAUDE POWER UI v2 — Core Application
   BYOK · Multi-model · Workspaces · Memory · Cost · Branching
   Skill auto-suggest · Streaming · 4 providers
   ============================================================ */

// ============================================================
// State
// ============================================================
const STATE = {
  sessions:        [],
  activeSessionId: null,

  apiKeys: { anthropic: '', openai: '', google: '', groq: '' },

  settings: {
    model:              'claude-sonnet-4-5',
    maxTokens:          4096,
    defaultSystemPrompt:
      'You are Claude, a highly capable AI assistant. You are working with a sophisticated developer who manages a curated library of 72+ skills and workflows. Be precise, direct, and structured.',
    skillAutoSuggest: true,
  },

  ui: {
    skillsPanelOpen:   true,
    skillsTab:         'skills',
    sidebarCollapsed:  false,
    systemPromptVisible: false,
    modelDropdownOpen: false,
    domainStates:      {},
    searchQuery:       '',
    injectedSkill:     null,
    skillSuggestions:  [],
    memoryPanelOpen:   false,
    activeProviderTab: 'anthropic',
  },

  streaming:              false,
  currentAbortController: null,

  costs: {
    sessionTotal: 0,
    dailyTotal:   0,
    dailyDate:    new Date().toDateString(),
  },
};

// ============================================================
// Utilities
// ============================================================
function generateId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

function formatRelative(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return 'just now';
  if (d < 3600000)  return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function estimateTokens(text) { return Math.ceil((text||'').length / 4); }

function toast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  el.innerHTML = `<span>${icons[type]||'ℹ'}</span><span>${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'all 0.2s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 220) + 'px';
}



// ============================================================
// ServerSync — detect local server, persist to disk, SSE sync
// ============================================================
const ServerSync = (() => {
  let _available   = false;
  let _evtSource   = null;
  let _indicator   = null;

  async function probe() {
    try {
      const r = await fetch('/api/ping', { signal: AbortSignal.timeout(800) });
      _available = r.ok;
    } catch { _available = false; }
    _updateIndicator();
    return _available;
  }

  function isAvailable() { return _available; }

  async function push(data) {
    if (!_available) return false;
    try {
      const r = await fetch('/api/state', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
        signal:  AbortSignal.timeout(3000),
      });
      return r.ok;
    } catch { return false; }
  }

  async function pull() {
    if (!_available) return null;
    try {
      const r = await fetch('/api/state', { signal: AbortSignal.timeout(3000) });
      if (r.ok) return r.json();
    } catch {}
    return null;
  }

  function subscribe(onStateChange) {
    if (!_available || _evtSource) return;
    _connect(onStateChange);
  }

  function _connect(cb) {
    _evtSource = new EventSource('/api/sync');
    _evtSource.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state-changed') cb();
      } catch {}
    };
    _evtSource.onerror = () => {
      _evtSource?.close();
      _evtSource = null;
      // Reconnect after 5s
      setTimeout(() => _connect(cb), 5000);
    };
  }

  function _updateIndicator() {
    if (!_indicator) {
      _indicator = document.getElementById('sync-indicator');
    }
    if (!_indicator) return;
    _indicator.title   = _available ? 'Server sync active' : 'localStorage only';
    _indicator.dataset.synced = _available ? '1' : '0';
  }

  /** Start an MCP stdio process via the server bridge. */
  async function startMcpStdio({ name, command, args, env }) {
    if (!_available) return null;
    try {
      const r = await fetch('/api/mcp/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, command, args: args || [], env: env || {} }),
        signal:  AbortSignal.timeout(8000),
      });
      if (r.ok) return r.json();
    } catch {}
    return null;
  }

  /** Fetch tool list from a running stdio MCP process. */
  async function getMcpTools(processId) {
    if (!_available) return null;
    try {
      const r = await fetch(`/api/mcp/${processId}/tools`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return r.json();
    } catch {}
    return null;
  }

  /** Call a tool on a running stdio MCP process. */
  async function callMcpTool(processId, tool, params) {
    if (!_available) return null;
    try {
      const r = await fetch(`/api/mcp/${processId}/call`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tool, params }),
        signal:  AbortSignal.timeout(30_000),
      });
      if (r.ok) return r.json();
    } catch {}
    return null;
  }

  /** Kill a running stdio MCP process. */
  async function stopMcpProcess(processId) {
    if (!_available) return;
    try {
      await fetch(`/api/mcp/${processId}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
    } catch {}
  }

  return { probe, isAvailable, push, pull, subscribe, startMcpStdio, getMcpTools, callMcpTool, stopMcpProcess };
})();

// ============================================================
// Persistence
// ============================================================
const STORAGE_KEY = 'claude_power_ui_v2';
const LEGACY_KEY  = 'claude_power_ui_v1';

function saveState() {
  // apiKeys are NOT stored in the main blob — they live in ApiKeyVault (encrypted)
  const data = {
    sessions:        STATE.sessions,
    activeSessionId: STATE.activeSessionId,
    settings:        STATE.settings,
    costs:           STATE.costs,
    ui: {
      skillsPanelOpen:  STATE.ui.skillsPanelOpen,
      skillsTab:        STATE.ui.skillsTab,
      sidebarCollapsed: STATE.ui.sidebarCollapsed,
      domainStates:     STATE.ui.domainStates,
      activeProviderTab:STATE.ui.activeProviderTab,
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      toast('⚠ Storage full — export a backup and clear old sessions to free space.', 'error', 8000);
    }
  }
  // Push to server for disk persistence + SSE broadcast (fire-and-forget)
  if (ServerSync.isAvailable()) {
    ServerSync.push(data).catch(() => {});
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      STATE.sessions        = data.sessions || [];
      STATE.activeSessionId = data.activeSessionId || null;
      // apiKeys: load from vault (async, done in boot())
      // Migrate legacy plaintext keys if they're in the old blob
      if (data.apiKeys && Object.values(data.apiKeys).some(v => v)) {
        ApiKeyVault.migrateFromPlaintext(data.apiKeys);
      }
      Object.assign(STATE.settings, data.settings || {});
      Object.assign(STATE.costs,    data.costs    || {});
      Object.assign(STATE.ui,       data.ui       || {});
      if (STATE.costs.dailyDate !== new Date().toDateString()) {
        STATE.costs.dailyTotal = 0;
        STATE.costs.dailyDate  = new Date().toDateString();
      }
      return;
    }
    // Migrate v1
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      STATE.sessions        = old.sessions || [];
      STATE.activeSessionId = old.activeSessionId || null;
      // Migrate single v1 key into vault
      if (old.settings?.apiKey) {
        ApiKeyVault.migrateFromPlaintext({ anthropic: old.settings.apiKey, openai: '', google: '', groq: '' });
      }
      if (old.settings) Object.assign(STATE.settings, old.settings);
      Object.assign(STATE.ui, old.ui || {});
      saveState();
      toast('Migrated from v1 — sessions and settings preserved ✓', 'success', 5000);
    }
  } catch (e) {
    console.warn('State load failed:', e);
  }
  if (STATE.costs.dailyDate !== new Date().toDateString()) {
    STATE.costs.dailyTotal = 0;
    STATE.costs.dailyDate  = new Date().toDateString();
  }
}

// ============================================================
// Session management

// ============================================================
function createSession(title = 'New Conversation') {
  Analytics.track('session_created', { title });
  const ws = MemorySystem.workspaces.getActive();
  const session = {
    id:           generateId(),
    title,
    workspaceId:  ws?.id || null,
    createdAt:    Date.now(),
    updatedAt:    Date.now(),
    messages:     [],
    systemPrompt: STATE.settings.defaultSystemPrompt,
    model:        STATE.settings.model,
    totalCost:    0,
    branchedFrom: null,
  };
  STATE.sessions.unshift(session);
  STATE.activeSessionId = session.id;
  return session;
}

function getActiveSession() {
  return STATE.sessions.find(s => s.id === STATE.activeSessionId) || null;
}

function deleteSession(id) {
  Analytics.track('session_deleted', { sessionId: id });
  STATE.sessions = STATE.sessions.filter(s => s.id !== id);
  if (STATE.activeSessionId === id) {
    STATE.activeSessionId = STATE.sessions[0]?.id || null;
  }
  saveState();
  renderAll();
}

function addMessage(sessionId, role, content) {
  const session = STATE.sessions.find(s => s.id === sessionId);
  if (!session) return null;
  const msg = { id: generateId(), role, content, timestamp: Date.now(), usage: null, cost: null };
  session.messages.push(msg);
  session.updatedAt = Date.now();
  if (role === 'user' && session.title === 'New Conversation' && content.trim()) {
    session.title = content.trim().slice(0, 52) + (content.length > 52 ? '…' : '');
  }
  return msg;
}

// ============================================================
// Branching
// ============================================================
function branchAtMessage(sessionId, messageId) {
  const src = STATE.sessions.find(s => s.id === sessionId);
  if (!src) return;
  const idx = src.messages.findIndex(m => m.id === messageId);
  if (idx < 0) return;

  const cloned = src.messages.slice(0, idx + 1).map(m => ({ ...m, id: generateId() }));
  const ns = {
    id:           generateId(),
    title:        `Branch: ${src.title.slice(0, 38)}`,
    workspaceId:  src.workspaceId,
    createdAt:    Date.now(),
    updatedAt:    Date.now(),
    messages:     cloned,
    systemPrompt: src.systemPrompt,
    model:        src.model,
    totalCost:    0,
    branchedFrom: { sessionId, messageId, parentTitle: src.title },
  };
  STATE.sessions.unshift(ns);
  STATE.activeSessionId = ns.id;
  saveState();
  renderAll();
  toast(`Branched from "${src.title.slice(0, 30)}"`, 'success');
}

function regenerateLastMessage() {
  const session = getActiveSession();
  if (!session || session.messages.length < 2 || STATE.streaming) return;
  const last = session.messages[session.messages.length - 1];
  if (last.role !== 'assistant') return;
  if (last.cost) session.totalCost = Math.max(0, (session.totalCost||0) - last.cost);
  session.messages.pop();
  const lastUser = [...session.messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return;
  saveState();
  renderMessages();
  renderSessionList();
  sendMessageDirect(session, lastUser.content);
  toast('Regenerating…', 'info', 1500);
}

// ============================================================
// Markdown renderer
// ============================================================
function renderMarkdown(text) {
  if (!text) return '';

  // ── H2 security: escape raw HTML in user/AI content before any pattern matching
  // This prevents XSS via bold, italic, table cells, blockquotes containing HTML tags
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Safe href: only allow https/http/mailto/# anchors
  function safeHref(url) {
    const u = url.trim();
    if (/^(https?:|mailto:|#)/.test(u)) return escapeHtml(u);
    return '#'; // strip javascript: and anything else
  }

  let html = text
    // Code blocks first (preserve content, escape HTML inside)
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = escapeHtml(code);
      return `<pre><code class="lang-${escapeHtml(lang||'text')}">${escaped}</code><button class="code-copy-btn" onclick="copyCodeBlock(this)">Copy</button></pre>`;
    })
    // Inline code (escape content)
    .replace(/`([^`\n]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
    // Now escape remaining free text before adding block-level markup
    // Bold / italic on already-HTML-safe content
    .replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${escapeHtml(t)}</strong>`)
    .replace(/\*([^*\n]+)\*/g,   (_, t) => `<em>${escapeHtml(t)}</em>`)
    // Headings
    .replace(/^### (.+)$/gm, (_, t) => `<h3>${escapeHtml(t)}</h3>`)
    .replace(/^## (.+)$/gm,  (_, t) => `<h2>${escapeHtml(t)}</h2>`)
    .replace(/^# (.+)$/gm,   (_, t) => `<h1>${escapeHtml(t)}</h1>`)
    .replace(/^---+$/gm, '<hr>')
    // Blockquotes
    .replace(/^> (.+)$/gm, (_, t) => `<blockquote>${escapeHtml(t)}</blockquote>`)
    // Tables (escape each cell)
    .replace(/^\|(.+)\|$/gm, (line) => {
      if (line.match(/^\|[-|: ]+\|$/)) return '';
      const cells = line.split('|').slice(1,-1).map(c => c.trim());
      return '<tr>' + cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>';
    })
    // List items
    .replace(/^[\*\-] (.+)$/gm, (_, t) => `<li>${escapeHtml(t)}</li>`)
    .replace(/^\d+\. (.+)$/gm,  (_, t) => `<li>${escapeHtml(t)}</li>`)
    // Links — validate href to prevent javascript: URIs
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
      `<a href="${safeHref(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    )
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/(<tr>.*<\/tr>)/gs, '<table>$1</table>');
  if (!html.match(/^<(h[1-6]|ul|ol|pre|table|blockquote|hr)/)) html = `<p>${html}</p>`;
  return html;
}

function copyCodeBlock(btn) {
  const code = btn.previousElementSibling?.textContent || '';
  navigator.clipboard.writeText(code)
    .then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); })
    .catch(() => toast('Copy failed — check browser clipboard permissions.', 'error'));
}

// ============================================================
// Cost helpers
// ============================================================
function formatCost(cost) {
  if (!cost || cost === 0) return null;
  if (cost < 0.001) return `$${(cost * 1000).toFixed(3)}m`;
  return `$${cost.toFixed(4)}`;
}

function addCostToSession(sessionId, costObj) {
  const session = STATE.sessions.find(s => s.id === sessionId);
  if (!session) return;
  const cost = costObj?.totalCost || 0;
  session.totalCost = (session.totalCost || 0) + cost;
  if (STATE.costs.dailyDate !== new Date().toDateString()) {
    STATE.costs.dailyTotal = 0;
    STATE.costs.dailyDate  = new Date().toDateString();
  }
  STATE.costs.dailyTotal += cost;
  // Track in analytics + per-user stats
  const model   = session.model || STATE.settings.model;
  const modelDef= MODELS_DATA?.getModel(model);
  Analytics.track('message_sent', {
    model,
    provider:      modelDef?.provider || 'anthropic',
    cost,
    inputTokens:   costObj?.inputTokens  || 0,
    outputTokens:  costObj?.outputTokens || 0,
    sessionId,
  });
  AuthSystem.recordMessageSent(cost);
}

function updateCostDisplays() {
  const session   = getActiveSession();
  const sessionCost = session?.totalCost || 0;
  const dailyCost   = STATE.costs.dailyTotal || 0;

  const el = document.getElementById('header-cost');
  if (el) {
    el.innerHTML = `
      <span>Session</span>
      <span class="cost-value">${sessionCost > 0 ? formatCost(sessionCost)||'$0' : '$0'}</span>
      <span style="opacity:.4">·</span>
      <span>Today</span>
      <span class="cost-value">${dailyCost > 0 ? formatCost(dailyCost)||'$0' : '$0'}</span>
    `;
  }
  const sc = document.getElementById('status-cost-value');
  if (sc) sc.textContent = dailyCost > 0 ? `Today: ${formatCost(dailyCost)||'$0'}` : 'Today: $0';
}

// ============================================================
// Context bar
// ============================================================
function updateContextBar() {
  const session = getActiveSession();
  if (!session) return;
  const model  = MODELS_DATA?.getModel(session.model);
  const maxK   = (model?.contextK || 200) * 1000;
  const allTxt = (session.systemPrompt||'') + session.messages.map(m=>m.content).join('');
  const used   = estimateTokens(allTxt);
  const pct    = Math.min(100, Math.round((used/maxK)*100));
  const fill   = document.getElementById('context-bar-fill');
  const label  = document.getElementById('context-label');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct > 85
      ? '#e11d48' : pct > 65
      ? '#f59e0b'
      : 'linear-gradient(90deg,var(--indigo-500),var(--cyan-500))';
  }
  if (label) label.textContent = `${pct}% context`;
}

// ============================================================
// Skill auto-detection
// ============================================================
let _skillTimer = null;

function onComposerInput(e) {
  autoResize(e.target);
  updateContextBar();
  if (!STATE.settings.skillAutoSuggest) return;
  clearTimeout(_skillTimer);
  _skillTimer = setTimeout(() => {
    const text = e.target.value.trim();
    if (text.length < 10) {
      STATE.ui.skillSuggestions = [];
      renderSkillSuggestions();
      return;
    }
    STATE.ui.skillSuggestions = SKILLS_DATA.detectSkills(text, 3);
    renderSkillSuggestions();
  }, 700);
}

function renderSkillSuggestions() {
  const bar = document.getElementById('skill-suggestions-bar');
  if (!bar) return;
  const skills = STATE.ui.skillSuggestions;
  if (!skills.length || STATE.ui.injectedSkill) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span class="skill-suggest-label">Suggested:</span>
    ${skills.map(s => `
      <button class="skill-suggest-chip"
              onclick="injectSkillFromSuggestion('${esc(s.slug)}','${esc(s.name)}')">
        ${esc(s.domainIcon||'')} ${esc(s.name)}
      </button>
    `).join('')}
    <button class="skill-suggest-dismiss" onclick="dismissSkillSuggestions()" title="Dismiss">✕</button>
  `;
}

function injectSkillFromSuggestion(slug, name) {
  STATE.ui.injectedSkill    = slug;
  STATE.ui.skillSuggestions = [];
  renderInjectedSkillTag();
  renderSkillSuggestions();
  toast(`Skill queued: ${name}`, 'info', 1500);
}

function dismissSkillSuggestions() {
  STATE.ui.skillSuggestions = [];
  renderSkillSuggestions();
}

function renderInjectedSkillTag() {
  const tag = document.getElementById('injected-skill-tag');
  if (!tag) return;
  if (STATE.ui.injectedSkill) {
    tag.style.display = 'flex';
    tag.innerHTML = `
      <span style="font-size:10px;color:var(--purple-400)">⚡ Skill:</span>
      <span style="font-size:11px;font-weight:600;color:var(--text-primary)">${esc(STATE.ui.injectedSkill)}</span>
      <button onclick="clearInjectedSkill()"
        style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:0 2px;line-height:1">✕</button>
    `;
  } else {
    tag.style.display = 'none';
    tag.innerHTML = '';
  }
}

function clearInjectedSkill() {
  STATE.ui.injectedSkill = null;
  renderInjectedSkillTag();
}

// ============================================================
// Memory panel
// ============================================================
function openMemoryPanel() {
  STATE.ui.memoryPanelOpen = true;
  renderMemoryPanel();
}

function closeMemoryPanel() {
  STATE.ui.memoryPanelOpen = false;
  document.getElementById('memory-panel-overlay')?.remove();
}

function renderMemoryPanel() {
  document.getElementById('memory-panel-overlay')?.remove();
  if (!STATE.ui.memoryPanelOpen) return;

  const ws   = MemorySystem.workspaces.getActive();
  const mems = ws ? MemorySystem.memories.list(ws.id) : [];

  const overlay = document.createElement('div');
  overlay.className = 'memory-panel-overlay';
  overlay.id = 'memory-panel-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMemoryPanel(); });

  overlay.innerHTML = `
    <div class="memory-panel">
      <div class="memory-panel-header">
        <div class="memory-panel-title">🧠 Memory — ${esc(ws?.name || 'Default')}</div>
        <button class="memory-panel-close" onclick="closeMemoryPanel()">✕</button>
      </div>

      <div class="memory-add-form">
        <div class="memory-input-row">
          <input class="memory-key-input" id="mem-key-input" placeholder="Key (e.g. Tech stack)" />
          <input class="memory-val-input" id="mem-val-input" placeholder="Value (e.g. Python 3.12, FastAPI)" />
          <button class="memory-add-btn" onclick="handleMemoryAdd()">Add</button>
        </div>
        <input class="memory-search-input" id="mem-search" placeholder="Search memories…" oninput="renderMemoryList()" />
      </div>

      <div class="memory-list" id="memory-list-inner">
        ${renderMemoryListHTML(mems)}
      </div>

      <button class="memory-auto-extract-btn" id="mem-extract-btn" onclick="handleAutoExtract()"
              ${!STATE.apiKeys.anthropic ? 'disabled title="Requires Anthropic API key"' : ''}>
        ✦ Auto-extract facts from current conversation
      </button>

      <div class="workspace-prompt-section">
        <div class="workspace-prompt-label">Workspace System Prefix</div>
        <textarea class="workspace-prompt-input" id="ws-prompt-input"
          placeholder="e.g. This workspace is for the Acme project. Always use Python 3.12.">${esc(ws?.systemPromptPrefix || '')}</textarea>
        <button onclick="saveWorkspacePrompt()"
          style="margin-top:6px;font-size:11px;padding:4px 10px;background:var(--indigo-500);color:#fff;border:none;border-radius:4px;cursor:pointer">Save Prefix</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function renderMemoryListHTML(mems, filter = '') {
  const lower    = filter.toLowerCase();
  const filtered = filter
    ? mems.filter(m => m.key.toLowerCase().includes(lower) || m.value.toLowerCase().includes(lower))
    : mems;

  if (!filtered.length) {
    return `<div class="memory-empty">No memories yet.<br>Add facts about your project above.</div>`;
  }

  return filtered.map(m => `
    <div class="memory-entry">
      <div class="memory-entry-key">${esc(m.key)}</div>
      <div class="memory-entry-value">${esc(m.value)}</div>
      <div class="memory-entry-meta">
        <span>${esc(m.source)}</span>
        <span>${new Date(m.createdAt).toLocaleDateString()}</span>
        ${m.useCount ? `<span>used ${m.useCount}×</span>` : ''}
      </div>
      <button class="memory-entry-del" onclick="handleMemoryDelete('${esc(m.id)}')">✕</button>
    </div>
  `).join('');
}

function renderMemoryList() {
  const inner = document.getElementById('memory-list-inner');
  if (!inner) return;
  const ws     = MemorySystem.workspaces.getActive();
  const mems   = ws ? MemorySystem.memories.list(ws.id) : [];
  const filter = document.getElementById('mem-search')?.value || '';
  inner.innerHTML = renderMemoryListHTML(mems, filter);
}

function handleMemoryAdd() {
  const key = document.getElementById('mem-key-input')?.value.trim();
  const val = document.getElementById('mem-val-input')?.value.trim();
  if (!key || !val) return;
  const ws = MemorySystem.workspaces.getActive();
  if (!ws) return;
  MemorySystem.memories.add(ws.id, { key, value: val, source: 'manual' });
  document.getElementById('mem-key-input').value = '';
  document.getElementById('mem-val-input').value = '';
  renderMemoryList();
  toast('Memory saved', 'success');
}

function handleMemoryDelete(id) {
  MemorySystem.memories.delete(id);
  renderMemoryList();
}

async function handleAutoExtract() {
  const session = getActiveSession();
  if (!session?.messages.length) { toast('No conversation to extract from', 'info'); return; }
  const btn = document.getElementById('mem-extract-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Extracting…'; }
  const ws = MemorySystem.workspaces.getActive();
  try {
    const facts = await MemorySystem.memories.autoExtract(STATE.apiKeys.anthropic, session.messages, ws?.id);
    if (!facts.length) { toast('No extractable facts found', 'info'); return; }
    facts.forEach(f => MemorySystem.memories.add(ws.id, { key: f.key, value: f.value, source: 'auto-extract' }));
    renderMemoryList();
    toast(`Extracted ${facts.length} fact${facts.length !== 1 ? 's' : ''}`, 'success');
  } catch (e) {
    toast('Extraction failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✦ Auto-extract facts from current conversation'; }
  }
}

function saveWorkspacePrompt() {
  const ws = MemorySystem.workspaces.getActive();
  if (!ws) return;
  const val = document.getElementById('ws-prompt-input')?.value || '';
  MemorySystem.workspaces.update(ws.id, { systemPromptPrefix: val });
  toast('Workspace prefix saved', 'success');
}

// ============================================================
// Workspace bar
// ============================================================
function renderWorkspaceBar() {
  const bar = document.getElementById('workspace-bar');
  if (!bar) return;
  const all    = MemorySystem.workspaces.list();
  const active = MemorySystem.workspaces.getActive();
  bar.innerHTML = `
    <div class="workspace-label">Workspace</div>
    <div class="workspace-selector">
      <select class="workspace-select" onchange="handleWorkspaceChange(this.value)">
        ${all.map(w => `<option value="${esc(w.id)}" ${w.id === active?.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
      </select>
      <button class="workspace-new-btn" onclick="handleNewWorkspace()" title="New workspace">+</button>
    </div>
  `;
}

function handleWorkspaceChange(id) {
  MemorySystem.workspaces.setActive(id);
  toast('Workspace switched', 'info', 1500);
}

function handleNewWorkspace() {
  const name = prompt('Workspace name:', 'New Workspace');
  if (!name?.trim()) return;
  MemorySystem.workspaces.create(name.trim());
  renderWorkspaceBar();
  toast(`Workspace "${name}" created`, 'success');
}

// ============================================================
// Session list rendering
// ============================================================
function renderSessionList() {
  const list = document.getElementById('session-list');
  if (!list) return;
  list.innerHTML = '';

  if (!STATE.sessions.length) {
    list.innerHTML = `<div style="padding:20px 16px;text-align:center;font-size:11px;color:var(--text-muted);line-height:1.6">No conversations yet.<br>Click + New Chat to start.</div>`;
    return;
  }

  STATE.sessions.forEach(session => {
    const isActive = session.id === STATE.activeSessionId;
    const isBranch = !!session.branchedFrom;
    const hasCost  = session.totalCost > 0;
    const count    = session.messages.length;

    const div = document.createElement('div');
    div.className = `session-item${isActive ? ' active' : ''}`;

    div.innerHTML = `
      <span class="session-icon">${isBranch ? '🔀' : '💬'}</span>
      <div class="session-info">
        <div class="session-title" title="${esc(session.title)}">${esc(session.title)}</div>
        <div class="session-meta">
          ${count} msg${count !== 1?'s':''} · ${formatRelative(session.updatedAt)}
          ${hasCost ? ` · ${formatCost(session.totalCost)}` : ''}
        </div>
        ${isBranch ? `<div class="session-branch-hint">↳ from ${esc(session.branchedFrom.parentTitle?.slice(0,30)||'')}</div>` : ''}
      </div>
      <button class="session-delete" title="Delete conversation">✕</button>
    `;

    div.addEventListener('click', e => {
      if (e.target.classList.contains('session-delete')) return;
      STATE.activeSessionId = session.id;
      saveState();
      renderAll();
    });

    div.querySelector('.session-delete').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Delete "${session.title}"?`)) deleteSession(session.id);
    });

    list.appendChild(div);
  });
}

// ============================================================
// Header
// ============================================================
function renderHeader() {
  const session  = getActiveSession();
  const titleEl  = document.getElementById('session-title-input');
  if (titleEl) titleEl.value = session?.title || 'New Conversation';

  const model    = MODELS_DATA?.getModel(session?.model || STATE.settings.model);
  const provider = MODELS_DATA?.getProvider(model?.provider);

  const nameEl = document.getElementById('current-model-name');
  if (nameEl && model) nameEl.textContent = model.shortName || model.name;

  const badgeEl = document.getElementById('current-provider-badge');
  if (badgeEl && provider) {
    badgeEl.textContent = provider.icon + ' ' + provider.name;
    badgeEl.style.color = provider.color;
  }

  const branches   = STATE.sessions.filter(s => s.branchedFrom?.sessionId === STATE.activeSessionId);
  const branchBadge = document.getElementById('branch-count-badge');
  if (branchBadge) {
    branchBadge.style.display = branches.length > 0 ? 'inline-flex' : 'none';
    if (branches.length > 0) branchBadge.textContent = `⎇ ${branches.length} branch${branches.length !== 1 ? 'es' : ''}`;
  }

  updateCostDisplays();
  updateContextBar();
}

// ============================================================
// Messages
// ============================================================
function renderMessages() {
  const session   = getActiveSession();
  const container = document.getElementById('messages');
  if (!container) return;

  if (!session || !session.messages.length) {
    container.innerHTML = `
      <div class="welcome-state" id="welcome">
        <div class="welcome-logo">✶</div>
        <h2 class="welcome-title">What can I help you with today?</h2>
        <p class="welcome-subtitle">Choose a starter below to kick off, or just type your first message. Each chat is saved automatically in your active workspace.</p>
        <div class="tg-bar">
          <div class="tg-search-wrap">
            <span class="tg-search-icon">🔍</span>
            <input class="tg-search" id="tg-search" type="search" placeholder="Search starters…" />
          </div>
          <div class="tg-filters" id="tg-filters"></div>
        </div>
        <div class="template-gallery" id="template-gallery"></div>
        <div class="welcome-hints">
          <span class="welcome-hint">📎 Attach a file</span>
          <span class="welcome-hint-sep">·</span>
          <span class="welcome-hint">✶ Change AI model</span>
          <span class="welcome-hint-sep">·</span>
          <span class="welcome-hint">🔧 Browse Skills</span>
          <span class="welcome-hint-sep">·</span>
          <span class="welcome-hint">💬 Just start typing</span>
        </div>
      </div>
    `;
    renderTemplateGallery();
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'messages-inner';

  session.messages.forEach((msg, idx) => {
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.dataset.msgId = msg.id;

    const avatar = msg.role === 'assistant' ? '✦' : '⬡';
    const rendered = renderMarkdown(msg.content);
    const isLastAssistant = msg.role === 'assistant' && idx === session.messages.length - 1;

    const costHtml = msg.cost ? `
      <div class="cost-chip">
        ${formatCost(msg.cost)||''}
        <div class="cost-chip-tooltip">
          <div>↑ Input: <span>${msg.usage?.inputTokens?.toLocaleString()||'—'}</span></div>
          <div>↓ Output: <span>${msg.usage?.outputTokens?.toLocaleString()||'—'}</span></div>
          <div>Cost: <span>${formatCost(msg.cost)||'—'}</span></div>
        </div>
      </div>` : '';

    div.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-bubble">${rendered}</div>
        <div class="message-meta">
          <span class="message-time">${formatTime(msg.timestamp)}</span>
          <div class="message-actions">
            ${msg.role === 'assistant' ? `<button class="msg-action-btn copy-msg-btn">Copy</button><button class="msg-action-btn preview-artifact-btn" title="Render HTML/React artifact in preview pane">□ Preview</button>` : ''}
            ${costHtml}
          </div>
        </div>
      </div>
      <div class="message-branch-actions">
        <button class="branch-btn" data-msg-id="${esc(msg.id)}">⎇ Fork reply</button>
        ${isLastAssistant ? '<button class="regen-btn">↺ Try again</button>' : ''}
      </div>
    `;

    div.querySelector('.copy-msg-btn')?.addEventListener('click', () => {
      copyToClipboard(div.querySelector('.message-bubble')?.innerText || '');
    });
    div.querySelector('.preview-artifact-btn')?.addEventListener('click', () => {
      openArtifactPreview(msg.content);
    });
    div.querySelector('.branch-btn')?.addEventListener('click', () => {
      branchAtMessage(session.id, msg.id);
    });
    div.querySelector('.regen-btn')?.addEventListener('click', regenerateLastMessage);

    inner.appendChild(div);
  });

  container.innerHTML = '';
  container.appendChild(inner);
  scrollToBottom();
}

/* ---- Template Gallery (welcome screen) ---- */
const TG_CATEGORIES = [
  { id: 'all',         label: 'All',         icon: '✪' },
  { id: 'workflow',    label: 'Workflows',   icon: '📋' },
  { id: 'engineering', label: 'Engineering', icon: '🛠️' },
  { id: 'writing',     label: 'Writing',     icon: '✍️' },
  { id: 'analysis',    label: 'Analysis',    icon: '📊' },
  { id: 'agents',      label: 'Agents',      icon: '⚡' },
  { id: 'memory',      label: 'Memory',      icon: '🧠' },
  { id: 'meta',        label: 'Meta',        icon: '✨' },
];

// Expanded template list — friendly names + plain-English prompts
const GALLERY_TEMPLATES = [
  // Workflow
  { id: 'brainstorm',    name: 'Brainstorm an idea',      icon: '💡', category: 'workflow',    desc: 'Explore a problem before jumping to solutions', prompt: 'I want to brainstorm: [YOUR IDEA OR PROBLEM]\n\nBefore we build anything, help me explore different angles, risks, and possibilities.' },
  { id: 'plan-execute',  name: 'Plan then build',         icon: '📋', category: 'workflow',    desc: 'Turn a spec into a step-by-step action plan', prompt: 'Turn this into a clear step-by-step plan I can act on:\n\n[DESCRIBE YOUR GOAL OR PROJECT]' },
  { id: 'summarise',     name: 'Summarise something',     icon: '📖', category: 'workflow',    desc: 'Get a crisp summary of any text or document', prompt: 'Please summarise the following clearly and concisely:\n\n[PASTE TEXT OR DESCRIBE DOCUMENT]' },
  { id: 'explain',       name: 'Explain a concept',       icon: '🎓', category: 'writing',     desc: 'Get a plain-English explanation of anything', prompt: 'Explain [TOPIC] to me in plain English. Assume I have basic knowledge but am not an expert.' },
  // Engineering
  { id: 'debug',         name: 'Debug a problem',         icon: '🐛', category: 'engineering', desc: 'Step-by-step diagnosis of a bug or error', prompt: 'Help me debug this issue:\n\n**What I expected:** [DESCRIBE]\n**What actually happened:** [DESCRIBE]\n**Relevant code or error message:**\n```\n[PASTE HERE]\n```' },
  { id: 'code-review',   name: 'Review my code',          icon: '👀', category: 'engineering', desc: 'Get feedback on quality, security & correctness', prompt: 'Please review this code for bugs, security issues, and improvements:\n\n```\n[PASTE CODE]\n```' },
  { id: 'tdd',           name: 'Write tests first',       icon: '🔴', category: 'engineering', desc: 'Start from tests, then implement', prompt: 'I want to build: [FEATURE DESCRIPTION]\n\nUsing test-driven development. Start by writing the test cases — what should pass and what should fail?' },
  { id: 'security',      name: 'Security check',          icon: '🔒', category: 'engineering', desc: 'Audit code or a system for vulnerabilities', prompt: 'Perform a security review on the following. Check for: input validation, authentication, authorisation, data exposure.\n\n[DESCRIBE SYSTEM OR PASTE CODE]' },
  { id: 'refactor',      name: 'Refactor & clean up',     icon: '♻️', category: 'engineering', desc: 'Improve existing code without changing behaviour', prompt: 'Refactor the following code to be cleaner, more readable, and easier to maintain. Do not change its behaviour.\n\n```\n[PASTE CODE]\n```' },
  // Writing
  { id: 'draft-email',   name: 'Draft an email',          icon: '✉️', category: 'writing',     desc: 'Write a clear, professional email', prompt: 'Write a professional email for the following situation:\n\n**To:** [RECIPIENT / ROLE]\n**Purpose:** [WHAT YOU NEED TO SAY]\n**Tone:** [formal / friendly / urgent]' },
  { id: 'proofreading',  name: 'Proofread my writing',    icon: '✏️', category: 'writing',     desc: 'Fix grammar, clarity and flow', prompt: 'Proofread and improve the following text. Correct grammar, improve clarity, and maintain my original voice:\n\n[PASTE TEXT]' },
  { id: 'doc-draft',     name: 'Write a document',        icon: '📄', category: 'writing',     desc: 'Draft a spec, proposal, or report', prompt: 'Help me write a [TYPE OF DOCUMENT: spec / proposal / report / FAQ] about:\n\n[TOPIC]\n\nAudience: [WHO WILL READ IT]' },
  // Analysis
  { id: 'data-analysis', name: 'Analyse data or results', icon: '📊', category: 'analysis',    desc: 'Interpret numbers, trends, or findings', prompt: 'Analyse the following data or results and tell me what stands out:\n\n[PASTE DATA OR DESCRIBE FINDINGS]' },
  { id: 'compare',       name: 'Compare options',         icon: '⚖️', category: 'analysis',    desc: 'Get a structured pros/cons breakdown', prompt: 'Compare these options and give me a structured breakdown with pros and cons:\n\nOption A: [DESCRIBE]\nOption B: [DESCRIBE]\n\nMy priorities: [WHAT MATTERS MOST TO YOU]' },
  // Agents & automation
  { id: 'automate',      name: 'Automate a task',         icon: '⚡', category: 'agents',      desc: 'Script, workflow, or multi-step automation', prompt: 'Help me automate: [DESCRIBE THE REPETITIVE TASK]\n\nPreferred tools/language: [e.g. Python, shell, n8n, Zapier]' },
  // Memory
  { id: 'compress',      name: 'Save conversation state', icon: '🧀', category: 'memory',      desc: 'Summarise a long session before the limit', prompt: 'We are approaching the context limit. Summarise this conversation so far, capturing:\n1. Decisions made\n2. Current state of work\n3. What to do next\n4. Key context a fresh session needs' },
  // Meta
  { id: 'skill-create',  name: 'Create a reusable skill', icon: '✨', category: 'meta',        desc: 'Build a prompt template you can use again', prompt: 'I want to create a reusable AI prompt template for: [DOMAIN OR USE CASE]\n\nHelp me define what it does, when to use it, and write the template.' },
];

let _tgActiveCategory = 'all';
let _tgQuery = '';

function renderTemplateGallery() {
  const gallery   = document.getElementById('template-gallery');
  const filtersEl = document.getElementById('tg-filters');
  const searchEl  = document.getElementById('tg-search');
  if (!gallery) return;

  // Render category filter pills
  if (filtersEl && !filtersEl.hasChildNodes()) {
    TG_CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className  = `tg-filter${cat.id === _tgActiveCategory ? ' active' : ''}`;
      btn.dataset.id = cat.id;
      btn.textContent = `${cat.icon} ${cat.label}`;
      btn.addEventListener('click', () => {
        _tgActiveCategory = cat.id;
        filtersEl.querySelectorAll('.tg-filter').forEach(b => b.classList.toggle('active', b.dataset.id === cat.id));
        _renderGalleryItems(gallery);
      });
      filtersEl.appendChild(btn);
    });
  }

  // Wire search
  if (searchEl && !searchEl.dataset.wired) {
    searchEl.dataset.wired = '1';
    searchEl.addEventListener('input', () => {
      _tgQuery = searchEl.value.trim().toLowerCase();
      _renderGalleryItems(gallery);
    });
  }

  _renderGalleryItems(gallery);
}

function _renderGalleryItems(gallery) {
  gallery.innerHTML = '';
  const templates = GALLERY_TEMPLATES.filter(t => {
    const catOk   = _tgActiveCategory === 'all' || t.category === _tgActiveCategory;
    const queryOk = !_tgQuery || t.name.toLowerCase().includes(_tgQuery) || t.desc.toLowerCase().includes(_tgQuery);
    return catOk && queryOk;
  });

  if (!templates.length) {
    gallery.innerHTML = '<div class="tg-empty">No starters match your search.</div>';
    return;
  }

  templates.forEach(t => {
    const card = document.createElement('button');
    card.className = 'tg-card';
    const catMeta = TG_CATEGORIES.find(c => c.id === t.category);
    card.innerHTML = `
      <span class="tg-card-icon">${t.icon}</span>
      <span class="tg-card-cat">${catMeta?.icon || ''} ${catMeta?.label || t.category}</span>
      <span class="tg-card-name">${esc(t.name)}</span>
      <span class="tg-card-desc">${esc(t.desc)}</span>
      <span class="tg-card-use">Use this →</span>
    `;
    card.addEventListener('click', () => {
      const input = document.getElementById('message-input');
      if (input) {
        input.value = t.prompt;
        autoResize(input);
        input.focus();
        // Highlight first placeholder bracket
        const sel = input.value.indexOf('[');
        if (sel >= 0) input.setSelectionRange(sel, input.value.indexOf(']', sel) + 1);
      }
    });
    gallery.appendChild(card);
  });
}

function showTypingIndicator() {
  let inner = document.querySelector('.messages-inner');
  if (!inner) {
    const c = document.getElementById('messages');
    if (!c) return;
    inner = document.createElement('div');
    inner.className = 'messages-inner';
    c.innerHTML = '';
    c.appendChild(inner);
  }
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="message-avatar" style="background:linear-gradient(135deg,var(--indigo-500),var(--purple-500))">✦</div>
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  inner.appendChild(div);
  scrollToBottom();
}

function hideTypingIndicator() { document.getElementById('typing-indicator')?.remove(); }

function updateLastAssistantBubble(content) {
  const msgs = document.querySelectorAll('.message.assistant');
  const last  = msgs[msgs.length - 1];
  if (last) { last.querySelector('.message-bubble').innerHTML = renderMarkdown(content); scrollToBottom(); }
}

function scrollToBottom() {
  const c = document.getElementById('messages');
  if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

// ============================================================
// Skills panel
// ============================================================
function renderSkillsPanel() {
  const list = document.getElementById('skills-list');
  if (!list) return;
  const query   = STATE.ui.searchQuery.toLowerCase();
  let domains   = SKILLS_DATA.domains;

  if (query) {
    domains = domains.map(d => ({
      ...d,
      skills: d.skills.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.desc.toLowerCase().includes(query) ||
        s.tags?.some(t => t.includes(query)) ||
        s.triggers?.some(t => t.includes(query))
      )
    })).filter(d => d.skills.length > 0);
  }

  list.innerHTML = domains.map(domain => {
    const isCollapsed = STATE.ui.domainStates[domain.id];
    return `
      <div class="skill-domain${isCollapsed ? ' collapsed' : ''}">
        <div class="skill-domain-header" onclick="toggleDomain('${domain.id}')">
          <span>${domain.icon}</span>
          <span class="skill-domain-name">${esc(domain.name)}</span>
          <span class="skill-domain-count">${domain.skills.length}</span>
          <span class="skill-domain-toggle">▾</span>
        </div>
        <div class="skill-domain-items">
          ${domain.skills.map(skill => `
            <div class="skill-item">
              <div class="skill-item-info">
                <div class="skill-item-name">${esc(skill.name)}</div>
                <div class="skill-item-desc">${esc(skill.desc)}</div>
              </div>
              <button class="skill-inject-btn" onclick="injectSkill('${esc(skill.slug)}','${esc(skill.name)}')">⟵</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderTemplatesPanel() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  list.innerHTML = '';

  // Group by category
  const groups = {};
  GALLERY_TEMPLATES.forEach(t => {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  });

  Object.entries(groups).forEach(([catId, items]) => {
    const catMeta = TG_CATEGORIES.find(c => c.id === catId);
    const labelEl = document.createElement('div');
    labelEl.className = 'template-category-label';
    labelEl.textContent = `${catMeta?.icon || ''} ${catMeta?.label || catId}`;
    list.appendChild(labelEl);

    items.forEach(t => {
      const div = document.createElement('button');
      div.className = 'template-item';
      div.innerHTML = `
        <div class="template-icon">${t.icon}</div>
        <div class="template-info">
          <div class="template-name">${esc(t.name)}</div>
          <div class="template-desc">${esc(t.desc)}</div>
        </div>
      `;
      div.addEventListener('click', () => {
        const input = document.getElementById('message-input');
        if (input) {
          input.value = t.prompt;
          autoResize(input);
          input.focus();
          const sel = input.value.indexOf('[');
          if (sel >= 0) input.setSelectionRange(sel, input.value.indexOf(']', sel) + 1);
        }
      });
      list.appendChild(div);
    });
  });
}

function toggleDomain(id) {
  STATE.ui.domainStates[id] = !STATE.ui.domainStates[id];
  saveState();
  renderSkillsPanel();
}

function injectSkill(slug, name) {
  Analytics.track('skill_injected', { skillSlug: slug, skillName: name });
  STATE.ui.injectedSkill    = slug;
  STATE.ui.skillSuggestions = [];
  renderInjectedSkillTag();
  renderSkillSuggestions();
  document.getElementById('message-input')?.focus();
  toast(`Skill queued: ${name}`, 'info', 1500);
}

function injectTemplate(t) {
  const input = document.getElementById('message-input');
  if (!input) return;
  input.value = t.prompt;
  autoResize(input);
  input.focus();
  const sel = input.value.indexOf('[');
  if (sel >= 0) input.setSelectionRange(sel, input.value.indexOf(']', sel) + 1);
}

// ============================================================
// Model dropdown
// ============================================================
function renderModelDropdown() {
  const dropdown = document.getElementById('model-dropdown');
  if (!dropdown) return;
  const currentModel = getActiveSession()?.model || STATE.settings.model;

  const groups = Object.values(MODELS_DATA.providers).map(p => ({
    provider: p,
    models:   MODELS_DATA.getModelsByProvider(p.id),
    hasKey:   !!STATE.apiKeys[p.id],
  }));

  dropdown.innerHTML = groups.map(({ provider, models, hasKey }, gi) => `
    ${gi > 0 ? '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.05);margin:2px 0">' : ''}
    <div class="model-dropdown-provider-section">
      <div class="model-dropdown-provider-label" style="color:${provider.color}">
        ${provider.icon} ${provider.name}${!hasKey ? ' — no key' : ''}
      </div>
      ${models.map(m => {
        const isActive   = m.id === currentModel;
        const isDisabled = !hasKey;
        return `
          <div class="model-dropdown-item${isActive?' active':''}${isDisabled?' disabled':''}"
               style="${isDisabled ? 'pointer-events:none' : ''}"
               onclick="${isDisabled ? 'return false' : `selectModel('${m.id}')`}">
            <span class="model-dropdown-item-name">${esc(m.shortName||m.name)}</span>
            <span class="model-dropdown-item-price">$${m.inputPer1M}/$${m.outputPer1M}</span>
            ${isActive ? '<span style="color:var(--indigo-400);font-size:12px">✓</span>' : ''}
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function selectModel(modelId) {
  const prevModel = getActiveSession()?.model || STATE.settings.model;
  Analytics.track('model_switched', { from: prevModel, to: modelId });
  const session = getActiveSession();
  if (session) session.model = modelId;
  STATE.settings.model     = modelId;
  STATE.ui.modelDropdownOpen = false;
  saveState();
  renderHeader();
  const dd = document.getElementById('model-dropdown');
  if (dd) dd.style.display = 'none';
  const model = MODELS_DATA.getModel(modelId);
  toast(`Model: ${model?.name || modelId}`, 'info', 1500);
}



// ============================================================
// Export
// ============================================================
function exportSession() {
  const session = getActiveSession();
  if (!session?.messages.length) { toast('No messages to export', 'info'); return; }
  const lines = [`# ${session.title}`, `*Model: ${session.model} — ${session.messages.length} messages*\n`];
  session.messages.forEach(m => {
    const role = m.role === 'user' ? '**You**' : '**Claude**';
    const cost = m.cost ? ` *(${formatCost(m.cost)})*` : '';
    lines.push(`${role}${cost}\n\n${m.content}\n\n---\n`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${session.title.replace(/[^a-z0-9]/gi,'_').slice(0,40)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported as Markdown', 'success');
}

// ============================================================
// File Attachments
// ============================================================
STATE.attachments = [];

function renderAttachmentBar() {
  const bar = document.getElementById('attachment-bar');
  if (!bar) return;
  if (!STATE.attachments.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML = STATE.attachments.map(a => `
    <div class="attachment-pill">
      <span class="attachment-icon">${a.type.startsWith('image/') ? '🖼' : a.type === 'application/pdf' ? '📄' : '📝'}</span>
      <span class="attachment-name">${esc(a.name.length > 24 ? a.name.slice(0,22) + '…' : a.name)}</span>
      <span class="attachment-size">${a.size < 1024 ? a.size + 'B' : a.size < 1048576 ? (a.size/1024).toFixed(0) + 'KB' : (a.size/1048576).toFixed(1) + 'MB'}</span>
      <button class="attachment-del" onclick="removeAttachment('${a.id}')">✕</button>
    </div>
  `).join('');
}

function removeAttachment(id) {
  STATE.attachments = STATE.attachments.filter(a => a.id !== id);
  renderAttachmentBar();
}

async function handleFiles(files) {
  for (const file of Array.from(files)) {
    if (file.size > 10 * 1024 * 1024) { toast(`${file.name} exceeds 10 MB`, 'error'); continue; }
    const att = { id: 'att_' + Math.random().toString(36).slice(2,9), name: file.name, type: file.type, size: file.size, content: null, dataUrl: null };
    try {
      if (file.type.startsWith('image/')) {
        att.dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); });
      } else if (file.size < 500000) {
        att.content = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file); });
      } else {
        att.content = `[Binary file: ${file.name} — ${(file.size/1024).toFixed(0)} KB]`;
      }
      STATE.attachments.push(att);
      renderAttachmentBar();
      Analytics.track('file_attached', { fileName: file.name, fileType: file.type, fileSize: file.size });
      toast(`Attached: ${file.name}`, 'success', 1500);
    } catch (e) { toast(`Cannot read ${file.name}`, 'error'); }
  }
}

function buildMessageContent(userText) {
  if (!STATE.attachments.length) return userText;
  // For Anthropic vision: use content array
  const parts = [];
  STATE.attachments.forEach(a => {
    if (a.dataUrl && a.type.startsWith('image/')) {
      // Store as special marker — ApiRouter will expand for Anthropic
      parts.push({ _type: 'image', dataUrl: a.dataUrl, mediaType: a.type });
    } else if (a.content) {
      parts.push({ _type: 'text', text: `[Attached file: ${a.name}]\n\`\`\`\n${a.content.slice(0, 8000)}\n\`\`\`` });
    }
  });
  parts.push({ _type: 'text', text: userText });
  STATE.attachments = [];
  renderAttachmentBar();
  return parts; // ApiRouter will handle array vs string
}

function attachDragDrop() {
  const composer = document.querySelector('.composer');
  if (!composer) return;
  composer.addEventListener('dragover', e => { e.preventDefault(); composer.classList.add('drag-over'); });
  composer.addEventListener('dragleave', () => composer.classList.remove('drag-over'));
  composer.addEventListener('drop', e => {
    e.preventDefault();
    composer.classList.remove('drag-over');
    if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
  });
  document.getElementById('file-input')?.addEventListener('change', e => handleFiles(e.target.files));
}

// ============================================================
// Artifact Preview (sandboxed iframe)
// ============================================================
function detectArtifact(content) {
  if (content.match(/<!DOCTYPE html/i) || (content.includes('<html') && content.includes('</html>')))
    return { type: 'html', code: content };
  const htmlBlock = content.match(/```html\n([\s\S]*?)```/);
  if (htmlBlock) return { type: 'html', code: htmlBlock[1] };
  const jsxBlock = content.match(/```(?:jsx?|tsx?)\n([\s\S]*?)```/);
  if (jsxBlock && jsxBlock[1].includes('return (')) return { type: 'jsx', code: jsxBlock[1] };
  return null;
}

function openArtifactPreview(content) {
  const artifact = detectArtifact(content);
  if (!artifact) { toast('No renderable artifact in this message', 'info'); return; }
  Analytics.track('artifact_previewed', { artifactType: artifact.type });
  document.getElementById('artifact-overlay')?.remove();

  let srcdoc = artifact.code;
  if (artifact.type === 'jsx') {
    srcdoc = `<!DOCTYPE html><html><head>
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>body{margin:0;padding:12px;font-family:sans-serif}</style></head><body>
<div id="root"></div>
<script type="text/babel">
${artifact.code}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(typeof App !== 'undefined' ? App : () => React.createElement('div','Component')));
<\/script></body></html>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'artifact-overlay';
  overlay.className = 'artifact-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.innerHTML = `
    <div class="artifact-modal">
      <div class="artifact-modal-header">
        <span class="artifact-modal-title">⬜ Artifact Preview</span>
        <span class="artifact-modal-type">${artifact.type.toUpperCase()}</span>
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="artifact-modal-btn" onclick="document.getElementById('artifact-frame').contentWindow.location.reload()">↺</button>
          <button class="artifact-modal-close" onclick="document.getElementById('artifact-overlay').remove()">✕</button>
        </div>
      </div>
      <iframe id="artifact-frame" class="artifact-frame" sandbox="allow-scripts" srcdoc="${srcdoc.replace(/"/g,'&quot;')}"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ============================================================
// Send message
// ============================================================
function handleSend() {
  let session = getActiveSession();
  if (!session) { session = createSession(); saveState(); renderSessionList(); }
  const input = document.getElementById('message-input');
  if (!input?.value.trim() && !STATE.attachments?.length) return;

  const userText = input.value.trim();
  const messageContent = buildMessageContent(userText || '[Attachment]');
  addMessage(session.id, 'user', typeof messageContent === 'string' ? messageContent : userText);
  input.value = '';
  autoResize(input);
  STATE.ui.skillSuggestions = [];
  renderSkillSuggestions();
  sendMessageDirect(session, userText, messageContent);
}

async function sendMessageDirect(session, userText, messageContent = null) {
  const model    = session.model || STATE.settings.model;
  const modelDef = MODELS_DATA?.getModel(model);
  const provider = modelDef?.provider || 'anthropic';
  const apiKey   = STATE.apiKeys[provider];

  if (!apiKey) {
    toast(`No API key for ${provider}. Please configure it in Settings.`, 'error', 6000);
    setTimeout(() => { window.location.href = 'admin.html'; }, 1500);
    return;
  }

  // Build system prompt: workspace prefix + memory context + session prompt
  let systemPrompt = '';
  const ws = MemorySystem.workspaces.getActive();
  if (ws?.systemPromptPrefix) systemPrompt += ws.systemPromptPrefix + '\n\n';
  const memCtx = ws ? MemorySystem.memories.buildContext(ws.id, userText) : '';
  if (memCtx) systemPrompt += memCtx + '\n';

  const spEl = document.getElementById('system-prompt');
  systemPrompt += spEl?.value || session.systemPrompt || STATE.settings.defaultSystemPrompt;

  // Apply injected skill prefix
  let finalText = userText;
  if (STATE.ui.injectedSkill) {
    finalText = `Read and follow the **${STATE.ui.injectedSkill}** skill.\n\n${userText}`;
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg?.role === 'user') lastMsg.content = finalText;
    STATE.ui.injectedSkill = null;
    renderInjectedSkillTag();
  }

  // Build API message array — support content arrays for vision
  const apiMessages = session.messages.map(m => {
    const isLastUser = m.role === 'user' && m === session.messages[session.messages.length - 1];
    if (isLastUser && messageContent && Array.isArray(messageContent)) {
      // Vision content: map _type markers to Anthropic format
      const content = messageContent.map(p => {
        if (p._type === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.dataUrl.split(',')[1] } };
        return { type: 'text', text: p._type === 'text' ? p.text : p };
      });
      return { role: m.role, content };
    }
    return { role: m.role, content: m.content };
  });

  STATE.streaming = true;
  STATE.currentAbortController = new AbortController();
  updateStreamingUI(true);
  renderMessages();
  showTypingIndicator();

  const assistantMsg = addMessage(session.id, 'assistant', '');
  hideTypingIndicator();

  let accumulated = '';
  let finalUsage  = null;

  try {
    for await (const chunk of ApiRouter.stream(
      provider, model, apiKey, apiMessages, systemPrompt,
      { maxTokens: STATE.settings.maxTokens, signal: STATE.currentAbortController.signal }
    )) {
      if (chunk.delta) {
        accumulated += chunk.delta;
        const msgObj = session.messages.find(m => m.id === assistantMsg.id);
        if (msgObj) msgObj.content = accumulated;
        updateLastAssistantBubble(accumulated);
      }
      if (chunk.done && chunk.usage) finalUsage = chunk.usage;
    }

    const msgObj = session.messages.find(m => m.id === assistantMsg.id);
    if (msgObj) {
      msgObj.content = accumulated;
      if (finalUsage && modelDef) {
        const costResult = MODELS_DATA.calculateCost(
          model,
          finalUsage.inputTokens  || 0,
          finalUsage.outputTokens || 0,
          finalUsage.cacheReadTokens || 0
        );
        msgObj.usage = finalUsage;
        msgObj.cost  = costResult.totalCost;
        addCostToSession(session.id, costResult);
      }
    }
  } catch (err) {
    hideTypingIndicator();
    if (err.name !== 'AbortError') {
      toast(`Error: ${err.message}`, 'error', 7000);
      console.error(err);
    } else {
      toast('Stopped', 'info');
    }
  } finally {
    STATE.streaming = false;
    STATE.currentAbortController = null;
    updateStreamingUI(false);
    saveState();
    renderMessages();
    renderSessionList();
    updateCostDisplays();
    scrollToBottom();
  }
}

function updateStreamingUI(streaming) {
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (sendBtn) sendBtn.style.display = streaming ? 'none' : 'flex';
  if (stopBtn) stopBtn.style.display = streaming ? 'flex' : 'none';
}

function stopStreaming() { STATE.currentAbortController?.abort(); }

// ============================================================
// Event listeners
// ============================================================
function attachEventListeners() {
  document.getElementById('send-btn')?.addEventListener('click', handleSend);
  document.getElementById('stop-btn')?.addEventListener('click', stopStreaming);

  const input = document.getElementById('message-input');
  if (input) {
    input.addEventListener('input', onComposerInput);
    input.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSend(); }
    });
  }

  // Session title — debounced so it doesn't saveState on every keystroke
  let _titleSaveTimer;
  document.getElementById('session-title-input')?.addEventListener('input', e => {
    clearTimeout(_titleSaveTimer);
    _titleSaveTimer = setTimeout(() => {
      const session = getActiveSession();
      if (session) { session.title = e.target.value; saveState(); renderSessionList(); }
    }, 500);
  });

  document.getElementById('system-prompt-toggle')?.addEventListener('click', () => {
    STATE.ui.systemPromptVisible = !STATE.ui.systemPromptVisible;
    const sp = document.getElementById('system-prompt-wrap');
    if (sp) sp.style.display = STATE.ui.systemPromptVisible ? 'block' : 'none';
    document.getElementById('system-prompt-toggle')?.classList.toggle('active', STATE.ui.systemPromptVisible);
  });

  document.getElementById('system-prompt')?.addEventListener('change', e => {
    const session = getActiveSession();
    if (session) { session.systemPrompt = e.target.value; saveState(); }
  });

  document.getElementById('new-chat-btn')?.addEventListener('click', () => {
    createSession();
    saveState();
    renderAll();
    document.getElementById('message-input')?.focus();
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    STATE.ui.sidebarCollapsed = !STATE.ui.sidebarCollapsed;
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('collapsed', STATE.ui.sidebarCollapsed);
    const toggle = document.getElementById('sidebar-toggle');
    if (toggle) toggle.textContent = STATE.ui.sidebarCollapsed ? '▶' : '◀';
    saveState();
  });

  document.getElementById('skills-toggle')?.addEventListener('click', () => {
    STATE.ui.skillsPanelOpen = !STATE.ui.skillsPanelOpen;
    const panel = document.getElementById('skills-panel');
    if (panel) panel.style.display = STATE.ui.skillsPanelOpen ? 'flex' : 'none';
    document.getElementById('skills-toggle')?.classList.toggle('active', STATE.ui.skillsPanelOpen);
    saveState();
  });

  document.getElementById('skills-tab-btn')?.addEventListener('click', () => {
    STATE.ui.skillsTab = 'skills';
    document.getElementById('skills-tab-btn')?.classList.add('active');
    document.getElementById('templates-tab-btn')?.classList.remove('active');
    document.getElementById('skills-list-wrap').style.display = 'flex';
    document.getElementById('templates-list-wrap').style.display = 'none';
    document.getElementById('skills-search-wrap').style.display = 'block';
    renderSkillsPanel();
  });

  document.getElementById('templates-tab-btn')?.addEventListener('click', () => {
    STATE.ui.skillsTab = 'templates';
    document.getElementById('templates-tab-btn')?.classList.add('active');
    document.getElementById('skills-tab-btn')?.classList.remove('active');
    document.getElementById('skills-list-wrap').style.display = 'none';
    document.getElementById('templates-list-wrap').style.display = 'flex';
    document.getElementById('skills-search-wrap').style.display = 'none';
    renderTemplatesPanel();
  });

  document.getElementById('skills-search')?.addEventListener('input', e => {
    STATE.ui.searchQuery = e.target.value;
    renderSkillsPanel();
  });

  document.getElementById('model-selector-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    STATE.ui.modelDropdownOpen = !STATE.ui.modelDropdownOpen;
    const dd = document.getElementById('model-dropdown');
    if (dd) {
      dd.style.display = STATE.ui.modelDropdownOpen ? 'block' : 'none';
      if (STATE.ui.modelDropdownOpen) renderModelDropdown();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#model-selector-btn') && !e.target.closest('#model-dropdown')) {
      STATE.ui.modelDropdownOpen = false;
      const dd = document.getElementById('model-dropdown');
      if (dd) dd.style.display = 'none';
    }
  });

  document.getElementById('settings-btn')?.addEventListener('click', () => window.location.href = 'admin.html');
  document.getElementById('export-btn')?.addEventListener('click', exportSession);
  document.getElementById('memory-btn')?.addEventListener('click', openMemoryPanel);

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      createSession(); saveState(); renderAll();
      document.getElementById('message-input')?.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      document.getElementById('skills-toggle')?.click();
    }
    if (e.key === 'Escape') {
      closeMemoryPanel();
      STATE.ui.modelDropdownOpen = false;
      const dd = document.getElementById('model-dropdown');
      if (dd) dd.style.display = 'none';
    }
  });
}

// ============================================================
// DOM builder
// ============================================================
function buildHTML() {
  const providers = Object.values(MODELS_DATA.providers);

  document.getElementById('app').innerHTML = `
    <div style="display:flex;height:100vh;width:100vw;overflow:hidden">

      <!-- ── Sidebar ────────────────────────────────── -->
      <aside class="sidebar" id="sidebar">

        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-logo">✦</div>
            <span class="brand-name sidebar-text">Claude Power</span>
          </div>
          <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">◀</button>
        </div>

        <!-- Workspace selector -->
        <div class="workspace-bar sidebar-text" id="workspace-bar"></div>

        <!-- New chat -->
        <button class="btn-new-chat sidebar-text" id="new-chat-btn">
          <span>+</span><span>New Chat</span>
        </button>

        <!-- Memory -->
        <button class="sidebar-memory-btn sidebar-text" id="memory-btn">
          🧠 <span>Memory</span>
        </button>

        <!-- Session list -->
        <div class="session-list" id="session-list"></div>

        <!-- Footer -->
        <div class="sidebar-footer">
          <button class="sidebar-footer-btn sidebar-text" id="settings-btn">⚙ Settings</button>
          <div class="status-cost sidebar-text">
            <span class="status-cost-label">💰</span>
            <span class="status-cost-value" id="status-cost-value">Today: $0</span>
          </div>
        </div>
      </aside>

      <!-- ── Main content ───────────────────────────── -->
      <main class="main-content">

        <!-- Header -->
        <header class="chat-header">
          <div class="header-left">
            <input class="session-title-input" id="session-title-input" placeholder="New Conversation" />
            <span class="branch-count-badge" id="branch-count-badge" style="display:none">⎇ 0</span>
          </div>
          <div class="header-center">
            <div class="context-bar-wrap">
              <div class="context-bar">
                <div class="context-bar-fill" id="context-bar-fill"></div>
              </div>
              <span class="context-label" id="context-label">0% context</span>
            </div>
          </div>
          <div class="header-right">
            <div class="header-cost-display" id="header-cost">
              <span>Session</span><span class="cost-value">$0</span>
            </div>
            <div class="model-selector" id="model-selector-btn">
              <span id="current-provider-badge" style="font-size:11px">✦</span>
              <span id="current-model-name" style="font-size:12px;font-weight:500;color:var(--text-secondary)">Claude</span>
              <span style="font-size:9px;color:var(--text-muted)">▾</span>
              <div class="model-dropdown" id="model-dropdown" style="display:none"></div>
            </div>
            <button class="icon-btn" id="export-btn" title="Export conversation (Markdown)">⇧</button>
            <button class="icon-btn" id="skills-toggle" title="Toggle AI Tools panel (⌘/)"><span style="font-size:13px">⋞</span> <span style="font-size:11px">Tools</span></button>
          </div>
        </header>

        <!-- Messages -->
        <div class="messages-container" id="messages"></div>

        <!-- Composer -->
        <div class="composer-wrap">
          <div class="composer-inner">
            <!-- Skill suggestions -->
            <div class="skill-suggestions-bar" id="skill-suggestions-bar" style="display:none"></div>

            <!-- System prompt -->
            <div class="composer-system-prompt" id="system-prompt-wrap" style="display:none">
              <textarea class="system-prompt-input" id="system-prompt"
                placeholder="System instructions…" rows="3"></textarea>
            </div>

            <!-- Injected skill tag -->
            <div class="injected-skill-tag" id="injected-skill-tag" style="display:none"></div>

            <!-- Attachment bar -->
            <div class="attachment-bar" id="attachment-bar" style="display:none"></div>

            <!-- Composer box -->
            <div class="composer">
              <div class="composer-input-row">
                <textarea
                  class="composer-input"
                  id="message-input"
                  placeholder="Ask anything, or pick a starter above… (⌘⏎ to send)"
                  rows="1"
                ></textarea>
              </div>
              <div class="composer-toolbar">
                <button class="composer-system-btn" id="system-prompt-toggle" title="Add custom instructions">📋 Instructions</button>
                <label class="composer-attach-btn" title="Attach file (image, text, PDF, code)" for="file-input">📎 Attach</label>
                <input type="file" id="file-input" style="display:none" multiple accept="image/*,.txt,.md,.js,.ts,.py,.json,.csv,.html,.css,.pdf" />
                <div class="composer-spacer"></div>
                <button class="send-btn" id="send-btn">↑ Send</button>
                <button class="stop-btn" id="stop-btn" style="display:none">⏹ Stop</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- ── Skills panel ───────────────────────────── -->
      <aside class="skills-panel" id="skills-panel"
             style="display:${STATE.ui.skillsPanelOpen ? 'flex' : 'none'}">
        <div class="skills-panel-header">
          <div class="skills-tabs">
            <button class="skills-tab-btn ${STATE.ui.skillsTab === 'skills' ? 'active' : ''}" id="skills-tab-btn">AI Tools</button>
            <button class="skills-tab-btn ${STATE.ui.skillsTab === 'templates' ? 'active' : ''}" id="templates-tab-btn">Starters</button>
          </div>
          <span style="font-size:10px;color:var(--text-muted)">${SKILLS_DATA.totalCount} tools</span>
        </div>

        <div class="skills-search-wrap" id="skills-search-wrap"
             style="${STATE.ui.skillsTab === 'templates' ? 'display:none' : ''}">
          <span class="skills-search-icon">🔍</span>
          <input type="search" class="skills-search" id="skills-search" placeholder="Search tools…" />
        </div>

        <div id="skills-list-wrap"
             style="flex:1;overflow-y:auto;display:${STATE.ui.skillsTab === 'skills' ? 'flex' : 'none'};flex-direction:column">
          <div id="skills-list"></div>
        </div>

        <div id="templates-list-wrap"
             style="flex:1;overflow-y:auto;display:${STATE.ui.skillsTab === 'templates' ? 'flex' : 'none'};flex-direction:column">
          <div id="templates-list"></div>
        </div>
      </aside>



      <!-- Toast container -->
      <div id="toast-container"></div>

    </div>
  `;
}

// ============================================================
// Render all
// ============================================================
function renderAll() {
  renderWorkspaceBar();
  renderSessionList();
  renderHeader();
  renderMessages();
  renderSkillsPanel();
  renderInjectedSkillTag();
  const session = getActiveSession();
  const spEl    = document.getElementById('system-prompt');
  if (spEl && session) spEl.value = session.systemPrompt || STATE.settings.defaultSystemPrompt;
  if (STATE.ui.skillsTab === 'templates') renderTemplatesPanel();
  updateCostDisplays();
  updateContextBar();
}

// ============================================================
async function boot() {
  // 0. Guard: block gracefully when opened as file:// — CORS will deny all API calls.
  //    The app MUST be served via server.py (http://localhost:8080).
  if (location.protocol === 'file:') {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  min-height:100vh;background:#030712;color:#e2e8f0;font-family:system-ui,sans-serif;
                  padding:40px;text-align:center;gap:20px">
        <div style="font-size:48px">⚠️</div>
        <h1 style="font-size:24px;font-weight:700;margin:0;color:#f8fafc">Open via Server, Not File</h1>
        <p style="max-width:480px;color:#94a3b8;line-height:1.6;margin:0">
          Claude Power UI must be served over HTTP — not opened as a local file.
          API calls, fonts, and sync are all blocked by the browser when using <code>file://</code>.
        </p>
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;
                    padding:20px 28px;font-family:monospace;font-size:14px;color:#818cf8;
                    text-align:left;max-width:420px;width:100%">
          <div style="color:#64748b;font-size:11px;margin-bottom:8px">Run this in your terminal:</div>
          python3 app/server.py<br>
          <div style="color:#64748b;font-size:11px;margin-top:12px;margin-bottom:4px">Then open:</div>
          <a href="http://localhost:8080/app/"
             style="color:#6366f1;text-decoration:none">http://localhost:8080/app/</a>
        </div>
        <a href="http://localhost:8080/app/"
           style="margin-top:8px;padding:12px 28px;background:#6366f1;color:#fff;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Open App →
        </a>
      </div>`;
    return;
  }

  // 0b. Init auth system (creates admin user on first run)
  await AuthSystem.init();

  // 0b. Auth guard — show login screen if not authenticated
  if (!AuthSystem.isLoggedIn()) {
    AuthSystem.renderLoginScreen();
    return;
  }

  // Track login session
  Analytics.track('login', { username: AuthSystem.getCurrentSession()?.username });

  // 1. Init memory system (ensures Default workspace exists)
  MemorySystem.init();

  // 2. Probe local server (enables disk persistence + SSE sync)
  const serverUp = await ServerSync.probe();

  // 3. Load persisted state
  loadState();
  if (serverUp) {
    const serverData = await ServerSync.pull();
    if (serverData?.sessions?.length) {
      STATE.sessions        = serverData.sessions;
      STATE.activeSessionId = serverData.activeSessionId || STATE.activeSessionId;
      Object.assign(STATE.settings, serverData.settings || {});
      Object.assign(STATE.costs,    serverData.costs    || {});
      Object.assign(STATE.ui,       serverData.ui       || {});
    }
  }

  // 4. Load encrypted API keys from vault
  const vaultResult = await ApiKeyVault.load();
  if (vaultResult === null && ApiKeyVault.hasVault()) {
    // Vault exists but session key is missing — prompt after render
    setTimeout(_showVaultUnlockModal, 600);
  } else if (vaultResult && typeof vaultResult === 'object') {
    Object.assign(STATE.apiKeys, vaultResult);
  }

  // 5. Build DOM
  buildHTML();

  // 6. Attach all events
  attachEventListeners();

  // 7. Ensure at least one session
  if (!STATE.sessions.length) {
    createSession('Getting Started — Claude Power UI v2');
  }

  // 8. Restore sidebar collapsed state
  if (STATE.ui.sidebarCollapsed) {
    document.getElementById('sidebar')?.classList.add('collapsed');
    const toggle = document.getElementById('sidebar-toggle');
    if (toggle) toggle.textContent = '▶';
  }

  // 9. First full render
  renderAll();

  // 10. Wire file drag+drop
  attachDragDrop();

  // 11. Inject user badge + sync indicator into header
  renderUserBadge();
  _renderSyncIndicator();

  // 12. Subscribe to SSE for real-time multi-device sync
  if (serverUp) {
    ServerSync.subscribe(async () => {
      const fresh = await ServerSync.pull();
      if (!fresh) return;
      STATE.sessions        = fresh.sessions        || STATE.sessions;
      STATE.activeSessionId = fresh.activeSessionId || STATE.activeSessionId;
      Object.assign(STATE.settings, fresh.settings || {});
      Object.assign(STATE.costs,    fresh.costs    || {});
      renderAll();
      toast('↻ State synced from another device', 'info', 3000);
    });
  }

  // 13. Prompt for API key if none set
  const hasKey = Object.values(STATE.apiKeys).some(k => k?.length > 0);
  if (!hasKey) {
    setTimeout(() => toast('⚙ Add an API key in Settings to start chatting', 'info', 8000), 800);
  }

  // 14. H4: Offline detection banner
  (function wireOffline() {
    function showOfflineBanner() {
      let banner = document.getElementById('offline-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.style.cssText = [
          'position:fixed','top:0','left:0','right:0','z-index:9999',
          'background:#7f1d1d','color:#fecaca','font-size:12px',
          'font-family:var(--font-ui,sans-serif)',
          'padding:7px 16px','text-align:center','font-weight:500',
          'letter-spacing:0.01em','box-shadow:0 2px 12px rgba(0,0,0,0.4)',
        ].join(';');
        banner.textContent = '⚠️ You are offline — messages cannot be sent until your connection is restored.';
        document.body.prepend(banner);
      }
      banner.style.display = 'block';
      document.getElementById('send-btn')?.setAttribute('disabled', 'true');
    }
    function hideOfflineBanner() {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.style.display = 'none';
      const sendBtn = document.getElementById('send-btn');
      if (sendBtn) sendBtn.removeAttribute('disabled');
    }
    window.addEventListener('offline', showOfflineBanner);
    window.addEventListener('online',  hideOfflineBanner);
    if (!navigator.onLine) showOfflineBanner();
  })();

  // 15. L3: ⌘⇧A shortcut to open admin dashboard (admin users only)
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
      if (AuthSystem.isAdmin()) {
        e.preventDefault();
        window.open('admin.html', '_blank');
      }
    }
  });

  const syncMode = serverUp ? 'server+SSE' : 'localStorage';
  const apiMode  = (typeof ApiRouter !== 'undefined' && ApiRouter.isProxied) ? 'proxy' : 'direct';
  console.log(`✦ Claude Power UI v2 ready — ${SKILLS_DATA.totalCount} skills · ${Object.keys(MODELS_DATA.providers).length} providers · ${STATE.sessions.length} sessions · sync:${syncMode} · api:${apiMode}`);
}

/** Inject a small sync status dot into the header (◉ = server, ◦ = local). */
function _renderSyncIndicator() {
  const header = document.querySelector('.chat-header');
  if (!header || document.getElementById('sync-indicator')) return;
  const dot = document.createElement('div');
  dot.id = 'sync-indicator';
  const active = ServerSync.isAvailable();
  dot.title = active ? 'Server sync active — state persists to disk' : 'localStorage only — run server.py to enable sync';
  dot.dataset.synced = active ? '1' : '0';
  dot.style.cssText = [
    'width:8px','height:8px','border-radius:50%','cursor:default',
    'flex-shrink:0','transition:background 0.3s',
    `background:${active ? '#22c55e' : '#64748b'}`,
    'margin-left:6px','align-self:center',
    'box-shadow:' + (active ? '0 0 6px #22c55e88' : 'none'),
  ].join(';');
  header.appendChild(dot);
}

/** Inline modal to re-enter password and unlock the API key vault. */
function _showVaultUnlockModal() {
  const overlay = document.createElement('div');
  overlay.id = 'vault-unlock-overlay';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:10000',
    'background:rgba(0,0,0,0.75)','display:flex',
    'align-items:center','justify-content:center',
  ].join(';');
  overlay.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;width:360px;max-width:90vw;text-align:center">
      <div style="font-size:28px;margin-bottom:12px">🔐</div>
      <h2 style="margin:0 0 8px;font-size:18px;color:#f1f5f9;font-family:var(--font-ui)">Unlock API Keys</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;line-height:1.5">
        Your API keys are encrypted. Re-enter your password to decrypt them for this session.
      </p>
      <input id="vault-unlock-pw" type="password" placeholder="Password" autocomplete="current-password"
        style="width:100%;box-sizing:border-box;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:14px;margin-bottom:8px;outline:none">
      <div id="vault-unlock-err" style="color:#f87171;font-size:12px;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:8px">
        <button id="vault-unlock-skip"
          style="flex:1;padding:10px;background:transparent;border:1px solid #334155;border-radius:8px;color:#94a3b8;cursor:pointer;font-size:13px">
          Skip
        </button>
        <button id="vault-unlock-btn"
          style="flex:2;padding:10px;background:#6366f1;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:600">
          Unlock
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('vault-unlock-pw')?.focus();

  async function attemptUnlock() {
    const pw    = document.getElementById('vault-unlock-pw')?.value || '';
    const errEl = document.getElementById('vault-unlock-err');
    if (errEl) errEl.style.display = 'none';
    if (!pw) {
      if (errEl) { errEl.textContent = 'Enter your password.'; errEl.style.display = 'block'; }
      return;
    }
    try {
      await AuthSystem.refreshVaultKey(pw);
      const keys = await ApiKeyVault.load();
      if (!keys || keys === null) throw new Error('bad key');
      Object.assign(STATE.apiKeys, keys);
      overlay.remove();
      renderAll();
      toast('🔓 API keys unlocked', 'success');
    } catch {
      sessionStorage.removeItem('cpu_vault_key');
      if (errEl) { errEl.textContent = 'Incorrect password — try again.'; errEl.style.display = 'block'; }
    }
  }

  document.getElementById('vault-unlock-btn')?.addEventListener('click', attemptUnlock);
  document.getElementById('vault-unlock-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptUnlock(); });
  document.getElementById('vault-unlock-skip')?.addEventListener('click', () => overlay.remove());
}

// ============================================================
// User Badge (shown in header when authenticated)
// ============================================================
function renderUserBadge() {
  const user    = AuthSystem.getCurrentUser();
  const session = AuthSystem.getCurrentSession();
  if (!user) return;

  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase();
  const isAdmin  = session?.role === 'admin';

  // Find or create badge container in header
  const header = document.querySelector('.chat-header');
  if (!header) return;

  // Remove existing badge if any
  document.getElementById('user-badge-wrap')?.remove();

  const wrap = document.createElement('div');
  wrap.id = 'user-badge-wrap';
  wrap.style.cssText = 'position:relative;display:flex;align-items:center;gap:6px;margin-left:4px';

  wrap.innerHTML = `
    <div class="user-badge" id="user-badge-btn" title="${esc(user.displayName || user.username)}">
      <div class="user-avatar">${initials}</div>
      <span class="user-badge-name">${esc(user.displayName || user.username)}</span>
      <span class="user-badge-role ${isAdmin ? 'admin' : 'user'}">${session?.role}</span>
    </div>
    <div class="user-menu-dropdown" id="user-menu" style="display:none">
      <div style="padding:8px 12px 6px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">
        Signed in as @${esc(user.username)}
      </div>
      <div class="user-menu-divider"></div>
      ${isAdmin ? `<button class="user-menu-item" onclick="window.open('admin.html','_blank')">
        <span>◈</span> Admin Dashboard
      </button>` : ''}
      <button class="user-menu-item" onclick="window.location.href='admin.html'">
        <span>⚙</span> Settings
      </button>
      <div class="user-menu-divider"></div>
      <button class="user-menu-item danger" onclick="doLogout()">
        <span>→</span> Sign Out
      </button>
    </div>
  `;

  header.appendChild(wrap);

  // Toggle menu
  document.getElementById('user-badge-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });

  // Close on outside click
  document.addEventListener('click', () => {
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = 'none';
  });
}

function doLogout() {
  Analytics.track('logout', { username: AuthSystem.getCurrentSession()?.username });
  AuthSystem.logout();
  window.location.reload();
}

document.addEventListener('DOMContentLoaded', boot);
