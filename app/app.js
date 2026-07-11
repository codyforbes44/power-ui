/* ============================================================
   CLAUDE POWER UI v2 — Core Application
   subscription · Multi-model · Workspaces · Memory · Cost · Branching
   Skill auto-suggest · Streaming · 4 providers
   ============================================================ */

import { MODELS_DATA } from './models-data.js';
import { ApiRouter } from './api-router.js';
import { ImageRouter } from './image-router.js';
import { MemorySystem } from './memory.js';
import { SKILLS_DATA } from './skills-data.js';
import { AuthSystem, ApiKeyVault } from './auth.js';
import { ProfileSystem } from './profile.js';
import { SuperAgent } from './agent.js';
import { Analytics } from './analytics.js';

// ============================================================
// State
// ============================================================
const STATE = {
  sessions:        [],
  activeSessionId: null,

  apiKeys: { anthropic: '', openai: '', google: '', groq: '', mistral: '', bfl: '', fal: '', replicate: '', huggingface: '', github: '' },

  settings: {
    model:              'claude-sonnet-4-5',
    maxTokens:          4096,
    defaultSystemPrompt:
      'You are a helpful AI assistant powered by Async — a premium AI platform. Be precise, knowledgeable, and deliver exceptional value to every member. Provide structured, high-quality responses that justify the premium experience.',
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
// IndexedDB Image Store (Resolves QuotaExceededError)
// ============================================================
const ImageDb = (() => {
  const DB_NAME = 'async_ai_images';
  const DB_VERSION = 1;
  const STORE_NAME = 'images';
  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function get(key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function set(key, value) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  return { get, set, remove };
})();

// ============================================================
// IndexedDB Session Store (Resolves localStorage quota limits)
// ============================================================
const SessionDb = (() => {
  const DB_NAME = 'async_ai_sessions';
  const DB_VERSION = 1;
  const STORE_NAME = 'state';
  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function get(key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function set(key, value) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  return { get, set };
})();

// ============================================================
// Firestore state-doc resolution
// ============================================================
// The synced state doc lives at users/{id}/state/current. We prefer the
// Firebase Auth UID as {id} so it matches firestore.rules (request.auth.uid),
// falling back to the AuthSystem user id when Firebase Auth is unavailable
// (degraded path — keeps sync working locally even if the auth SDK failed).
function cpuFirebaseUid() {
  try {
    if (typeof AuthSystem !== 'undefined' && typeof AuthSystem.getFirebaseUid === 'function') {
      return AuthSystem.getFirebaseUid();
    }
  } catch { /* ignore */ }
  try { return (window.firebaseAuth && window.firebaseAuth.currentUser && window.firebaseAuth.currentUser.uid) || null; }
  catch { return null; }
}

function cpuStateDocRef(session) {
  if (typeof window.db === 'undefined') return null;
  const docId = cpuFirebaseUid() || (session && session.userId) || null;
  if (!docId) return null;
  return window.db.collection('users').doc(docId).collection('state').doc('current');
}

// One-time migration: when a user first signs into Firebase, their synced
// state lives under the old AuthSystem-id path. Copy it into the new
// Firebase-UID path (while firestore.rules are still open) so cloud sync
// survives the cutover. Guarded per-UID via a localStorage flag; best-effort.
async function cpuMigrateFirestoreState(oldUserId) {
  try {
    if (typeof window.db === 'undefined') return;
    const uid = cpuFirebaseUid();
    if (!uid || !oldUserId || uid === oldUserId) return; // nothing to migrate
    const flag = 'cpu_fs_migrated_' + uid;
    if (localStorage.getItem(flag)) return; // already migrated for this UID

    const newRef = window.db.collection('users').doc(uid).collection('state').doc('current');
    const newDoc = await newRef.get();
    const newData = newDoc.exists ? newDoc.data() : null;
    const newHasData = !!(newData && newData.data);

    if (!newHasData) {
      const oldRef = window.db.collection('users').doc(oldUserId).collection('state').doc('current');
      const oldDoc = await oldRef.get();
      if (oldDoc.exists) {
        const oldData = oldDoc.data();
        if (oldData && oldData.data) {
          await newRef.set(oldData, { merge: true });
          console.log(`✦ Firestore: migrated state ${oldUserId} → ${uid}`);
        }
      }
    }
    localStorage.setItem(flag, String(Date.now()));
  } catch (e) {
    console.warn('Firestore migration skipped:', e && e.message);
  }
}
window.__cpuMigrateFirestoreState = cpuMigrateFirestoreState;

// ============================================================
// ServerSync — detect local server, persist to disk, SSE sync
// ============================================================
const ServerSync = (() => {
  let _available   = false;
  let _mcpAvailable = false;
  let _evtSource   = null;
  let _indicator   = null;
  let _firebaseUnsub = null;
  let _onStateChange = null;   // remembered so we can rebind after auth-ready
  let _boundDocId    = null;   // doc id the current onSnapshot is bound to
  let _authReadyBound = false; // guard: attach the auth-ready listener only once

  async function probe() {
    // 1. Probe local server for MCP features
    try {
      const r = await fetch('/api/ping', { signal: AbortSignal.timeout(800) });
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        _mcpAvailable = body.sync === true;
      } else {
        _mcpAvailable = false;
      }
    } catch { _mcpAvailable = false; }

    // 2. Check Firebase availability
    const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;
    const hasFirebase = !!(typeof window.db !== 'undefined' && session && session.userId);
    _available = hasFirebase || _mcpAvailable;

    _updateIndicator();
    return _available;
  }

  function isAvailable() { return _available; }

  async function push(data) {
    if (!_available) return false;

    // Use Firebase if available
    const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;
    const pushRef = (session && session.userId) ? cpuStateDocRef(session) : null;
    if (pushRef) {
      try {
        await pushRef.set({
          data: JSON.stringify(data),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
      } catch(e) { console.error('Firebase sync push error', e); }
    }

    // Fallback to local server
    if (_mcpAvailable) {
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
    return false;
  }

  async function pull() {
    if (!_available) return null;

    const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;
    const pullRef = (session && session.userId) ? cpuStateDocRef(session) : null;
    if (pullRef) {
      try {
        const doc = await pullRef.get();
        if (doc.exists) {
          const d = doc.data();
          if (d && d.data) return JSON.parse(d.data);
        }
      } catch(e) { console.error('Firebase sync pull error', e); }
    }

    if (_mcpAvailable) {
      try {
        const r = await fetch('/api/state', { signal: AbortSignal.timeout(3000) });
        if (r.ok) return r.json();
      } catch {}
    }
    return null;
  }

  function subscribe(onStateChange) {
    if (!_available) return;

    const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;
    const subRef = (session && session.userId) ? cpuStateDocRef(session) : null;
    if (subRef) {
      _onStateChange = onStateChange;
      // login() signs into Firebase asynchronously, so this first subscription
      // is usually bound to the OLD AuthSystem-id doc path (Firebase UID not
      // ready yet). Attach a one-time listener that rebinds to the Firebase-UID
      // path once auth becomes ready — otherwise, after strict rules deploy,
      // this subscription keeps reading a now-denied path.
      _bindAuthReadyRebind();
      if (_firebaseUnsub) return;
      _boundDocId = cpuFirebaseUid() || (session && session.userId) || null;
      _firebaseUnsub = subRef
        .onSnapshot((doc) => {
          if (doc.exists && !doc.metadata.hasPendingWrites) {
            onStateChange();
          }
        });
      return;
    }

    if (_mcpAvailable && !_evtSource) {
      _connect(onStateChange);
    }
  }

  // Attach the one-time cpu:firebase-auth-ready listener (dispatched by
  // firebase-config.js's onAuthStateChanged) that rebinds the Firestore
  // subscription to the Firebase-UID doc path. Idempotent.
  function _bindAuthReadyRebind() {
    if (_authReadyBound) return;
    _authReadyBound = true;
    try {
      window.addEventListener('cpu:firebase-auth-ready', _rebindFirebaseSync);
    } catch { /* ignore */ }
  }

  // Tear down the existing onSnapshot subscription and re-create it against the
  // current doc path (Firebase UID, falling back to session.userId). No-op when
  // there is nothing subscribed yet or we're already bound to the target doc id
  // (keeps it idempotent across repeated auth-ready events). Best-effort.
  function _rebindFirebaseSync() {
    try {
      if (!_onStateChange) return; // nothing subscribed yet
      const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;
      const targetId = cpuFirebaseUid() || (session && session.userId) || null;
      if (!targetId || targetId === _boundDocId) return; // already bound correctly
      const subRef = cpuStateDocRef(session);
      if (!subRef) return;
      if (_firebaseUnsub) { try { _firebaseUnsub(); } catch { /* ignore */ } _firebaseUnsub = null; }
      _boundDocId = targetId;
      _firebaseUnsub = subRef
        .onSnapshot((doc) => {
          if (doc.exists && !doc.metadata.hasPendingWrites) {
            _onStateChange();
          }
        });
      console.log('✦ Firestore: rebound sync → ' + targetId);
    } catch (e) {
      console.warn('Firestore rebind skipped:', e && e.message);
    }
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
    const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;
    const hasFirebase = typeof window.db !== 'undefined' && session && session.userId;
    _indicator.title   = hasFirebase ? 'Cloud sync active (Firebase)' : (_mcpAvailable ? 'Server sync active' : 'localStorage only');
    _indicator.dataset.synced = _available ? '1' : '0';
  }

  /** Start an MCP stdio process via the server bridge. */
  async function startMcpStdio({ name, command, args, env }) {
    if (!_mcpAvailable) return null;
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
    if (!_mcpAvailable) return null;
    try {
      const r = await fetch(`/api/mcp/${processId}/tools`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return r.json();
    } catch {}
    return null;
  }

  /** Call a tool on a running stdio MCP process. */
  async function callMcpTool(processId, tool, params) {
    if (!_mcpAvailable) return null;
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
    if (!_mcpAvailable) return;
    try {
      await fetch(`/api/mcp/${processId}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
    } catch {}
  }

  return { probe, isAvailable, push, pull, subscribe, startMcpStdio, getMcpTools, callMcpTool, stopMcpProcess };
})();

// ============================================================
// Persistence
// ============================================================
const STORAGE_KEY = 'async_ai_v2';
const LEGACY_KEY  = 'async_ai_v1';

function saveState() {
  // apiKeys are NOT stored in the main blob — they live in ApiKeyVault (encrypted)
  const data = {
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

  // Save the heavy sessions data to IndexedDB
  SessionDb.set('sessions', STATE.sessions).catch(e => {
    console.error('SessionDb: save failed', e);
  });

  // Push to server for disk persistence + SSE broadcast (fire-and-forget)
  if (ServerSync.isAvailable()) {
    const fullData = { ...data, sessions: STATE.sessions };
    ServerSync.push(fullData).catch(() => {});
  }
}

async function loadState() {
  // ── Migrate from legacy brand key (claude_power_ui → async_ai) ──────────
  // Runs once on first boot after the rebrand. Reads old state blob from
  // the previous storage key, saves it under the new key, then deletes old.
  const OLD_KEY = 'claude_power_ui_v2';
  if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(OLD_KEY)) {
    try {
      const oldData = localStorage.getItem(OLD_KEY);
      // Remove old keys FIRST to free quota before writing under new key
      localStorage.removeItem(OLD_KEY);
      localStorage.removeItem('claude_power_ui_v1');
      localStorage.setItem(STORAGE_KEY, oldData);
      console.log('✦ Async: migrated storage from claude_power_ui_v2 → async_ai_v2');
    } catch(e) { console.warn('Async: storage migration error (quota full — starting fresh)', e); }
  }

  try {
    // Load sessions from IndexedDB first
    let sessions = await SessionDb.get('sessions');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);

      // Auto-migrate sessions from localStorage to IndexedDB if they exist in legacy blob
      if (!sessions && data.sessions) {
        sessions = data.sessions;
        await SessionDb.set('sessions', sessions);
        delete data.sessions;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          console.log('✦ Async: migrated sessions from localStorage to IndexedDB');
        } catch (e) {
          console.warn('Async: failed to clean legacy sessions from localStorage', e);
        }
      }

      STATE.sessions        = sessions || [];
      STATE.activeSessionId = data.activeSessionId || null;
      // apiKeys: load from vault (async, done in boot())
      // Migrate legacy plaintext keys if they're in the old blob
      if (data.apiKeys && Object.values(data.apiKeys).some(v => v)) {
        ApiKeyVault.migrateFromPlaintext(data.apiKeys);
        // Strip plaintext key material from the stored blob so it never
        // lingers in localStorage after being moved into the encrypted vault.
        delete data.apiKeys;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
          console.warn('Async: failed to strip plaintext apiKeys from localStorage', e);
        }
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
      sessions = old.sessions || [];
      await SessionDb.set('sessions', sessions);

      STATE.sessions        = sessions;
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

function addMessage(sessionId, role, content, extraFields = {}) {
  const session = STATE.sessions.find(s => s.id === sessionId);
  if (!session) return null;
  const msg = { id: generateId(), role, content, timestamp: Date.now(), usage: null, cost: null, ...extraFields };
  session.messages.push(msg);
  session.updatedAt = Date.now();
  if (role === 'user' && session.title === 'New Conversation' && content.trim()) {
    session.title = content.trim().slice(0, 52) + (content.length > 52 ? '…' : '');
  }
  return msg.id;
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

  // Safe href: only allow https/http/mailto/# anchors.
  // The URL was already HTML-escaped by the whole-input escape below, so we
  // only need to gate the scheme here (no re-escaping — that would double-encode).
  function safeHref(url) {
    const u = url.trim();
    if (/^(https?:|mailto:|#)/.test(u)) return u;
    return '#'; // strip javascript: and anything else
  }

  // Escape the ENTIRE input up front so no raw user/AI HTML can survive into
  // innerHTML. Every markdown transform below then operates on already-escaped
  // text, so the only HTML in the output is the tags this function generates.
  // Note: '>' becomes '&gt;', so the blockquote pattern matches on '&gt; '.
  let html = escapeHtml(text)
    // Code blocks first (content is already escaped — do not re-escape)
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang||'text'}">${code}</code><button class="code-copy-btn" onclick="copyCodeBlock(this)">Copy</button></pre>`)
    // Inline code
    .replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`)
    // Bold / italic
    .replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`)
    .replace(/\*([^*\n]+)\*/g,   (_, t) => `<em>${t}</em>`)
    // Headings
    .replace(/^### (.+)$/gm, (_, t) => `<h3>${t}</h3>`)
    .replace(/^## (.+)$/gm,  (_, t) => `<h2>${t}</h2>`)
    .replace(/^# (.+)$/gm,   (_, t) => `<h1>${t}</h1>`)
    .replace(/^---+$/gm, '<hr>')
    // Blockquotes ('>' was escaped to '&gt;')
    .replace(/^&gt; (.+)$/gm, (_, t) => `<blockquote>${t}</blockquote>`)
    // Tables
    .replace(/^\|(.+)\|$/gm, (line) => {
      if (line.match(/^\|[-|: ]+\|$/)) return '';
      const cells = line.split('|').slice(1,-1).map(c => c.trim());
      return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    })
    // List items
    .replace(/^[*-] (.+)$/gm, (_, t) => `<li>${t}</li>`)
    .replace(/^\d+\. (.+)$/gm,  (_, t) => `<li>${t}</li>`)
    // Links — validate href to prevent javascript: URIs
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
      `<a href="${safeHref(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
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

  // ── Slash command picker ──────────────────────────────────────
  const raw = e.target.value;
  if (raw.startsWith('/')) {
    // Show picker if user types just '/' or '/partial-command'
    // but not if they've already passed a space (mid-prompt typing)
    const spaceIdx = raw.indexOf(' ');
    if (spaceIdx === -1 || (spaceIdx > 0 && raw.slice(0, spaceIdx).startsWith('/'))) {
      const query = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
      showSlashPicker(query);
    } else {
      hideSlashPicker();
    }
  } else if (_slash.visible) {
    hideSlashPicker();
  }
  // ─────────────────────────────────────────────────────────────

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
    <button class="skill-suggest-dismiss" onclick="dismissSkillSuggestions()" title="Dismiss" aria-label="Dismiss suggestions">✕</button>
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

// ============================================================
// Slash Command Picker
// ============================================================
const SLASH_COMMANDS = [
  {
    trigger:  '/imagine',
    aliases:  ['/img'],
    icon:     '🎨',
    name:     '/imagine',
    desc:     'Generate an image — describe what you want to see',
    detail:   'Supports --provider bfl|fal|replicate, --size WxH, --steps N',
    insert:   '/imagine ',
    category: 'image',
  },
  {
    trigger:  '/web',
    aliases:  ['/search'],
    icon:     '🔍',
    name:     '/web',
    desc:     'Search the web for current info, news, or facts',
    detail:   'AI will call web_search automatically',
    insert:   '/web ',
    category: 'tools',
  },
  {
    trigger:  '/remember',
    aliases:  ['/save', '/mem'],
    icon:     '💾',
    name:     '/remember',
    desc:     'Save something to persistent memory for future chats',
    detail:   'e.g. /remember my stack is Next.js + Postgres',
    insert:   '/remember ',
    category: 'memory',
  },
  {
    trigger:  '/recall',
    aliases:  ['/memory'],
    icon:     '🧠',
    name:     '/recall',
    desc:     'Search your saved memories and surface relevant facts',
    detail:   'e.g. /recall project name',
    insert:   '/recall ',
    category: 'memory',
  },
  {
    trigger:  '/recap',
    aliases:  ['/summary', '/tldr'],
    icon:     '📖',
    name:     '/recap',
    desc:     'Summarise this conversation so far',
    detail:   'Useful before hitting context limits',
    insert:   '/recap',
    category: 'workflow',
  },
  {
    trigger:  '/compress',
    aliases:  ['/save-context'],
    icon:     '🗜️',
    name:     '/compress',
    desc:     'Save conversation state before the context limit',
    detail:   'Preserves decisions, current state, and next steps',
    insert:   '/compress',
    category: 'workflow',
  },
];

// Internal state for the picker
const _slash = {
  visible:  false,
  query:    '',
  activeIdx: 0,
  filtered: [],
};

function _slashFilter(query) {
  const q = query.toLowerCase().replace(/^\//,'');
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(c => {
    const text = [c.trigger, ...c.aliases, c.desc, c.category].join(' ').toLowerCase();
    return text.includes(q);
  });
}

function _slashHighlight(name, query) {
  if (!query) return esc(name);
  const q = query.replace(/^\//,'');
  if (!q) return esc(name);
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(name);
  return esc(name.slice(0,idx)) +
    '<em>' + esc(name.slice(idx, idx+q.length)) + '</em>' +
    esc(name.slice(idx+q.length));
}

function renderSlashPicker() {
  // Mount point: the .composer element (positioned relative)
  const composer = document.querySelector('.composer');
  if (!composer) return;

  let el = document.getElementById('slash-picker');

  if (!_slash.visible || !_slash.filtered.length) {
    if (el) {
      el.style.animation = 'none';
      el.remove();
    }
    return;
  }

  const query = _slash.query;

  const itemsHTML = _slash.filtered.map((cmd, i) => `
    <div class="slash-picker-item${i === _slash.activeIdx ? ' active' : ''}"
         data-idx="${i}"
         id="slash-item-${i}">
      <div class="slash-picker-item-icon">${cmd.icon}</div>
      <div class="slash-picker-item-body">
        <div class="slash-picker-item-name">${_slashHighlight(cmd.name, query)}</div>
        <div class="slash-picker-item-desc">${esc(cmd.desc)}</div>
      </div>
      <span class="slash-picker-item-shortcut">${esc(cmd.category)}</span>
    </div>
  `).join('');

  const html = `
    <div class="slash-picker-header">
      <span class="slash-picker-header-key">/</span>
      Slash Commands &nbsp;·&nbsp; ${_slash.filtered.length} match${_slash.filtered.length!==1?'es':''}
    </div>
    <div class="slash-picker-list" id="slash-picker-list">${itemsHTML}</div>
    <div class="slash-picker-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> or <kbd>Tab</kbd> select</span>
      <span><kbd>Esc</kbd> dismiss</span>
    </div>
  `;

  if (!el) {
    el = document.createElement('div');
    el.id = 'slash-picker';
    el.className = 'slash-picker';
    // ensure .composer is positioned
    composer.style.position = 'relative';
    composer.appendChild(el);

    // Click-outside to dismiss
    const outside = (e) => {
      const el2 = document.getElementById('slash-picker');
      const input = document.getElementById('message-input');
      if (el2 && !el2.contains(e.target) && e.target !== input) {
        hideSlashPicker();
        document.removeEventListener('mousedown', outside, true);
      }
    };
    document.addEventListener('mousedown', outside, true);
  }

  el.innerHTML = html;

  // Wire item clicks
  el.querySelectorAll('.slash-picker-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // don't blur the textarea
      const idx = parseInt(item.dataset.idx, 10);
      _slash.activeIdx = idx;
      commitSlashCommand();
    });
    item.addEventListener('mouseenter', () => {
      _slash.activeIdx = parseInt(item.dataset.idx, 10);
      renderSlashPicker();
    });
  });

  // Scroll active item into view
  const activeEl = document.getElementById(`slash-item-${_slash.activeIdx}`);
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function showSlashPicker(query) {
  _slash.query    = query;
  _slash.filtered = _slashFilter(query);
  _slash.visible  = !!_slash.filtered.length;
  _slash.activeIdx = 0;
  renderSlashPicker();
}

function hideSlashPicker() {
  _slash.visible  = false;
  _slash.query    = '';
  _slash.filtered = [];
  _slash.activeIdx = 0;
  renderSlashPicker();
}

function commitSlashCommand() {
  const cmd = _slash.filtered[_slash.activeIdx];
  if (!cmd) return hideSlashPicker();

  const input = document.getElementById('message-input');
  if (!input) return;

  input.value = cmd.insert;
  autoResize(input);
  input.focus();
  // Place cursor at end
  input.setSelectionRange(input.value.length, input.value.length);
  hideSlashPicker();

  // If /imagine — open the image popover instead
  if (cmd.trigger === '/imagine') {
    input.value = '';
    autoResize(input);
    toggleImagePopover();
    return;
  }
}

function _slashNavKey(e) {
  if (!_slash.visible) return false;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _slash.activeIdx = Math.min(_slash.activeIdx + 1, _slash.filtered.length - 1);
    renderSlashPicker();
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    _slash.activeIdx = Math.max(_slash.activeIdx - 1, 0);
    renderSlashPicker();
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    commitSlashCommand();
    return true;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    hideSlashPicker();
    return true;
  }
  return false;
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
        <button class="memory-panel-close" onclick="closeMemoryPanel()" aria-label="Close memory panel">✕</button>
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
      <button class="memory-entry-del" onclick="handleMemoryDelete('${esc(m.id)}')" aria-label="Delete memory">✕</button>
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
      <button class="workspace-new-btn" onclick="handleNewWorkspace()" title="New workspace" aria-label="New workspace">+</button>
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

  // Sort: pinned first, then by updatedAt desc
  const sorted = [...STATE.sessions].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return  1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  sorted.forEach(session => {
    const isActive = session.id === STATE.activeSessionId;
    const isBranch = !!session.branchedFrom;
    const hasCost  = session.totalCost > 0;
    const count    = session.messages.length;
    const isPinned = !!session.pinned;

    const div = document.createElement('div');
    div.className = `session-item${isActive ? ' active' : ''}${isPinned ? ' pinned' : ''}`;

    div.innerHTML = `
      <span class="session-icon">${isBranch ? '🔀' : (isPinned ? '📌' : '💬')}</span>
      <div class="session-info">
        <div class="session-title" title="Double-click to rename" data-sid="${esc(session.id)}">${esc(session.title)}</div>
        <div class="session-meta">
          ${count} msg${count !== 1?'s':''} · ${formatRelative(session.updatedAt)}
          ${hasCost ? ` · ${formatCost(session.totalCost)}` : ''}
        </div>
        ${isBranch ? `<div class="session-branch-hint">↳ from ${esc(session.branchedFrom.parentTitle?.slice(0,30)||'')}</div>` : ''}
      </div>
      <div class="session-actions">
        <button class="session-pin" title="${isPinned ? 'Unpin' : 'Pin conversation'}" aria-label="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '📌' : '⊕'}</button>
        <button class="session-delete" title="Delete conversation" aria-label="Delete conversation">✕</button>
      </div>
    `;

    // Click → activate
    div.addEventListener('click', e => {
      if (e.target.classList.contains('session-delete')) return;
      if (e.target.classList.contains('session-pin')) return;
      if (e.target.classList.contains('session-title') && e.detail === 2) return; // handled by dblclick
      STATE.activeSessionId = session.id;
      saveState();
      renderAll();
    });

    // Double-click title → inline rename
    div.querySelector('.session-title').addEventListener('dblclick', e => {
      e.stopPropagation();
      const titleEl = e.currentTarget;
      const oldTitle = session.title;
      titleEl.setAttribute('contenteditable', 'true');
      titleEl.style.cssText = 'outline:none;background:rgba(99,102,241,0.1);border-radius:4px;padding:0 2px;';
      titleEl.focus();
      // Select all
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);

      function commitRename() {
        const newTitle = titleEl.textContent.trim() || oldTitle;
        titleEl.removeAttribute('contenteditable');
        titleEl.style.cssText = '';
        session.title = newTitle;
        titleEl.textContent = newTitle;
        saveState();
        renderSessionList();
      }
      titleEl.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { e2.preventDefault(); commitRename(); }
        if (e2.key === 'Escape') { titleEl.textContent = oldTitle; commitRename(); }
      }, { once: false });
      titleEl.addEventListener('blur', commitRename, { once: true });
    });

    // Pin button
    div.querySelector('.session-pin').addEventListener('click', e => {
      e.stopPropagation();
      session.pinned = !session.pinned;
      saveState();
      renderSessionList();
      toast(session.pinned ? '📌 Conversation pinned' : 'Unpinned', 'info', 1500);
    });

    // Delete button
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

    // ── Image generation bubble ────────────────────────────
    if (msg.imageGenerating) {
      div.className += ' image-generating';
      div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
          <div class="image-gen-loading">
            <div class="image-gen-spinner"></div>
            <div class="image-gen-loading-text">
              <span class="image-gen-label">🎨 Generating image…</span>
              <span class="image-gen-prompt">${esc(msg.imagePrompt || '')}</span>
            </div>
          </div>
        </div>
      `;
      inner.appendChild(div);
      return;
    }
    if (msg.content && msg.content.startsWith('__IMAGE__:')) {
      let imgData;
      try { imgData = JSON.parse(msg.content.slice(10)); } catch { imgData = null; }
      if (imgData) {
        let imagesHtml = '';
        if (imgData.images && imgData.images.length > 1) {
          imagesHtml = `
            <div class="image-gen-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 8px;">
              ${imgData.images.map((img, idx) => {
                const imgDb = img.src && img.src.startsWith('db:');
                const dl = img.src
                  ? `<a class="image-gen-download" href="${imgDb ? '#' : img.src}" download="generated-${img.seed || Date.now()}-${idx}.png" title="Download image">⬇ Download</a>`
                  : '';
                return `
                  <div class="image-gen-grid-item" style="display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; padding: 4px;">
                    <img src="${imgDb ? '' : img.src}" ${imgDb ? `data-db-src="${img.src.slice(3)}"` : ''} alt="${esc(imgData.prompt)}" class="image-gen-img ${imgDb ? 'db-image-load' : ''}"
                      loading="lazy" style="width: 100%; border-radius: 4px; cursor: pointer; aspect-ratio: ${imgData.width}/${imgData.height}; object-fit: cover;"
                      onclick="this.classList.toggle('image-gen-img-expanded')" />
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 4px 2px 4px; font-size: 11px; color: var(--text-muted);">
                      ${img.seed > 0 ? `<span>seed: ${img.seed}</span>` : ''}
                      ${dl}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        } else {
          const isDb = imgData.src && imgData.src.startsWith('db:');
          const dlLink = imgData.src
            ? `<a class="image-gen-download" href="${isDb ? '#' : imgData.src}" download="generated-${imgData.seed || Date.now()}.png" title="Download image">⬇ Download</a>`
            : '';
          imagesHtml = `
            <div class="image-gen-result">
              <img src="${isDb ? '' : imgData.src}" ${isDb ? `data-db-src="${imgData.src.slice(3)}"` : ''} alt="${esc(imgData.prompt)}" class="image-gen-img ${isDb ? 'db-image-load' : ''}"
                loading="lazy" onclick="this.classList.toggle('image-gen-img-expanded')" />
              <div class="image-gen-footer">
                <span class="image-gen-provider">${esc(imgData.provider || '')} • ${esc(imgData.model || '')}</span>
                <span class="image-gen-dims">${imgData.width}×${imgData.height}</span>
                ${imgData.seed > 0 ? `<span class="image-gen-seed">seed: ${imgData.seed}</span>` : ''}
                <span class="image-gen-timing">${imgData.timingS}s</span>
                ${dlLink}
              </div>
            </div>
          `;
        }

        div.innerHTML = `
          <div class="message-avatar">${avatar}</div>
          <div class="message-content">
            ${imagesHtml}
            <div class="image-gen-caption" style="margin-top: 6px;">${esc(imgData.prompt)}</div>
            ${imgData.images && imgData.images.length > 1 ? `
              <div class="image-gen-footer" style="margin-top: 4px; border-top: none; padding-top: 0;">
                <span class="image-gen-provider">${esc(imgData.provider || '')} • ${esc(imgData.model || '')}</span>
                <span class="image-gen-dims">${imgData.width}×${imgData.height}</span>
                <span class="image-gen-timing">${imgData.timingS}s</span>
              </div>
            ` : ''}
            <div class="image-gen-suggestions" style="margin-top: 10px;">
              <button class="image-gen-remix-btn" onclick="remixImagePrompt(this.dataset.prompt)" data-prompt="${esc(imgData.prompt).replace(/"/g, '&quot;')}" style="background: transparent; border: 1px solid var(--border-color); border-radius: 12px; padding: 6px 12px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--text-main); transition: all 0.2s;" onmouseover="this.style.background='var(--bg-card)';" onmouseout="this.style.background='transparent';">
                <span style="font-size: 14px;">🎲</span> Remix & Randomize
              </button>
              ${AuthSystem.isAdmin && AuthSystem.isAdmin() ? `
              <button class="image-gen-bg-btn" onclick="setAgentBackground('${imgData.src || (imgData.images && imgData.images[0] ? imgData.images[0].src : '')}')" style="background: transparent; border: 1px solid var(--border-color); border-radius: 12px; padding: 6px 12px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--text-main); transition: all 0.2s; margin-left: 8px;" onmouseover="this.style.background='var(--bg-card)';" onmouseout="this.style.background='transparent';">
                <span style="font-size: 14px;">🖼️</span> Set Agent Background
              </button>
              ` : ''}
            </div>
          </div>
        `;
        inner.appendChild(div);
        return;
      }
    }

    // ── Image generation error card ──────────────────────
    if (msg.content && msg.content.startsWith('__IMG_ERROR__:')) {
      let errData;
      try { errData = JSON.parse(msg.content.slice(14)); } catch { errData = null; }
      if (errData) {
        div.innerHTML = `
          <div class="message-avatar">${avatar}</div>
          <div class="message-content">
            <div class="image-gen-error-card">
              <div class="image-gen-error-header">
                <span class="image-gen-error-icon">${errData.icon || '⚠️'}</span>
                <div>
                  <div class="image-gen-error-title">${esc(errData.title || 'Generation Failed')}</div>
                  <div class="image-gen-error-provider">${esc(errData.provider || '')}</div>
                </div>
              </div>
              <div class="image-gen-error-body">${esc(errData.body || '')}</div>
              ${errData.action ? `<div class="image-gen-error-action">${errData.action}</div>` : ''}
            </div>
          </div>
        `;
        inner.appendChild(div);
        return;
      }
    }
    // ── End image bubble ────────────────────────────────

    const rendered = renderMarkdown(msg.content);
    const isLastAssistant = msg.role === 'assistant' && idx === session.messages.length - 1;

    // ── Skip 'tool' role messages from visible rendering (they're shown inside tool call blocks) ──
    if (msg.role === 'tool') {
      inner.appendChild(div); // mount empty — hidden via CSS
      div.style.display = 'none';
      return;
    }

    // ── Build tool call blocks HTML ──
    let toolCallsHtml = '';
    if (msg.toolCalls?.length) {
      toolCallsHtml = msg.toolCalls.map(tc => {
        const toolIcons = { generate_image: '🎨', web_search: '🔍', memory_recall: '🧠', memory_save: '💾', calculate: '🧮' };
        const icon = toolIcons[tc.name] || '🔧';
        const argsStr = JSON.stringify(tc.input, null, 2);
        const isRunning = tc.running;

        let resultHtml = '';
        if (tc.result) {
          if (tc.result.startsWith('__TOOL_IMAGE__:')) {
            let imgData;
            try { imgData = JSON.parse(tc.result.slice(15)); } catch {}
            if (imgData) {
              resultHtml = `
                <div class="tool-result-image">
                  <img src="${imgData.src}" alt="${esc(imgData.prompt)}" class="image-gen-img"
                    loading="lazy" onclick="this.classList.toggle('image-gen-img-expanded')" />
                  <div class="image-gen-footer">
                    <span class="image-gen-provider">${esc(imgData.provider||'')} • ${esc(imgData.model||'')}</span>
                    <span class="image-gen-dims">${imgData.width}×${imgData.height}</span>
                    ${imgData.seed > 0 ? `<span class="image-gen-seed">seed: ${imgData.seed}</span>` : ''}
                    <span class="image-gen-timing">${imgData.timingS}s</span>
                    <a class="image-gen-download" href="${imgData.src}" download="generated-${Date.now()}.png">⬇ Download</a>
                  </div>
                </div>`;
            }
          } else {
            resultHtml = `<div class="tool-result-text">${renderMarkdown(tc.result)}</div>`;
          }
        }

        return `
          <div class="tool-call-block ${isRunning ? 'tool-call-running' : tc.result ? 'tool-call-done' : ''}">
            <div class="tool-call-header" onclick="this.parentElement.classList.toggle('tool-call-expanded')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.parentElement.classList.toggle('tool-call-expanded')}">
              <span class="tool-call-icon">${icon}</span>
              <span class="tool-call-name">${esc(tc.name.replace(/_/g,' '))}</span>
              <span class="tool-call-status">${isRunning ? '<span class="tool-call-spinner"></span> Running…' : tc.result ? '✓ Done' : '⏳ Queued'}</span>
              <span class="tool-call-chevron">›</span>
            </div>
            <div class="tool-call-body">
              <div class="tool-call-args"><pre><code>${esc(argsStr)}</code></pre></div>
              ${resultHtml ? `<div class="tool-call-result">${resultHtml}</div>` : ''}
            </div>
          </div>`;
      }).join('');
    }

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
        ${toolCallsHtml ? `<div class="tool-calls-container">${toolCallsHtml}</div>` : ''}
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

  // Asynchronously load images from IndexedDB
  container.querySelectorAll('.db-image-load').forEach(async (img) => {
    const key = img.getAttribute('data-db-src');
    if (!key) return;
    try {
      const base64 = await ImageDb.get(key);
      if (base64) {
        img.src = base64;
        const containerItem = img.closest('.image-gen-result, .image-gen-grid-item');
        if (containerItem) {
          const dlLink = containerItem.querySelector('.image-gen-download');
          if (dlLink) dlLink.href = base64;
        }
      }
    } catch (err) {
      console.error('Failed to load image from IndexedDB:', err);
    }
  });
}

/* ---- Template Gallery (welcome screen) ---- */
const TG_CATEGORIES = [
  { id: 'all',         label: 'All',          icon: '✪'  },
  { id: 'workflow',    label: 'Workflows',    icon: '📋' },
  { id: 'engineering', label: 'Engineering',  icon: '🛠️' },
  { id: 'writing',     label: 'Writing',      icon: '✍️' },
  { id: 'analysis',    label: 'Analysis',     icon: '📊' },
  { id: 'image',       label: 'Image Gen',    icon: '🎨' },
  { id: 'agents',      label: 'Agents',       icon: '⚡' },
  { id: 'memory',      label: 'Memory',       icon: '🧠' },
  { id: 'meta',        label: 'Meta',         icon: '✨' },
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
  // ── Image Generation (ComfyUI + Flux) ─────────────────────────────────
  { id: 'img-portrait',  name: 'AI Portrait',             icon: '🖼️', category: 'image',       desc: 'Photorealistic person portrait with Flux Pro',   prompt: '/imagine Ultra-photorealistic portrait of [DESCRIBE PERSON: age, gender, features, expression], professional studio lighting, shallow depth of field, 85mm lens, 4K detail --size 1024x1440' },
  { id: 'img-landscape', name: 'Landscape / Scene',       icon: '🏔️', category: 'image',       desc: 'Wide cinematic landscape or environment',         prompt: '/imagine Epic cinematic landscape of [DESCRIBE SCENE: mountains, forest, desert, etc.], golden hour light, dramatic sky, volumetric fog, photorealistic, 8K --size 1792x1024' },
  { id: 'img-concept',   name: 'Concept Art',             icon: '🎭', category: 'image',       desc: 'Digital concept art / illustration style',        prompt: '/imagine [DESCRIBE SUBJECT] as detailed concept art, digital painting, trending on ArtStation, by [STYLE: Greg Rutkowski / Artgerm / WLOP], cinematic lighting, 4K resolution' },
  { id: 'img-product',   name: 'Product Shot',            icon: '📦', category: 'image',       desc: 'Studio-quality product photography',              prompt: '/imagine Professional product photography of [DESCRIBE PRODUCT], white studio background, soft diffused lighting, shot on Sony A7R IV, sharp focus, commercial quality' },
  { id: 'img-logo',      name: 'Logo / Icon',             icon: '✦',  category: 'image',       desc: 'Minimal vector-style logo or icon',               prompt: '/imagine Minimal flat vector logo for [BRAND/CONCEPT], clean lines, single color on white background, professional branding, SVG style, simple and memorable' },
  { id: 'img-anime',     name: 'Anime / Illustration',    icon: '🌸', category: 'image',       desc: 'Japanese anime or manga illustration style',      prompt: '/imagine [DESCRIBE CHARACTER/SCENE] in detailed anime art style, vibrant colors, expressive eyes, detailed background, Studio Ghibli / Makoto Shinkai inspiration, 4K' },
  { id: 'img-ui',        name: 'UI / App Mockup',         icon: '📱', category: 'image',       desc: 'Generate a UI screen or app design mockup',       prompt: '/imagine High-fidelity UI mockup of [DESCRIBE APP/SCREEN: e.g. dark mode dashboard, mobile wallet app], clean modern design, Figma-quality, glassmorphism, sharp UI details' },
  { id: 'img-comfy',     name: 'ComfyUI Custom Workflow', icon: '⚙️', category: 'image',       desc: 'Describe any image — routes to local ComfyUI',    prompt: '/imagine [DESCRIBE YOUR IMAGE IN DETAIL — style, subject, lighting, mood, camera settings, aspect ratio]\n\nTip: Switch model to ComfyUI in the model selector for local generation.' },
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
  if (!last) return;
  // A tool-only assistant message (toolCalls but empty content) has no
  // .message-bubble yet — create one so streaming text after a tool_use block
  // doesn't hit a null and abort the reply.
  let bubble = last.querySelector('.message-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const toolContainer = last.querySelector('.tool-calls-container');
    if (toolContainer) toolContainer.after(bubble);
    else (last.querySelector('.message-content') || last).prepend(bubble);
  }
  bubble.innerHTML = renderMarkdown(content);
  scrollToBottom();
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
        <div class="skill-domain-header" onclick="toggleDomain('${domain.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleDomain('${domain.id}')}">
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
    hasKey:   p.id === 'image-gen'
                ? true   // image-gen shows all; per-model key check happens at generation time
                : !!STATE.apiKeys[p.id],
  })).filter(g => g.models.length > 0);

  dropdown.innerHTML = groups.map(({ provider, models, hasKey }, gi) => {
    const isImgGroup = provider.id === 'image-gen';
    return `
    ${gi > 0 ? '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.05);margin:2px 0">' : ''}
    <div class="model-dropdown-provider-section">
      <div class="model-dropdown-provider-label" style="color:${provider.color}">
        ${provider.icon} ${provider.name}${!hasKey && !isImgGroup ? ' — no key' : ''}
        ${isImgGroup ? '<span style="font-size:10px;color:#94a3b8;margin-left:4px">per-image billing</span>' : ''}
      </div>
      ${models.map(m => {
        const isActive   = m.id === currentModel;
        const isDisabled = !hasKey && !isImgGroup;
        const priceStr   = isImgGroup
          ? `<span class="model-dropdown-item-badge" style="color:#ec4899;background:rgba(236,72,153,0.12)">${m.badge || 'IMG'}</span>`
          : `<span class="model-dropdown-item-price">$${m.inputPer1M}/$${m.outputPer1M}</span>`;
        const tooltip    = m.desc ? `title="${esc(m.desc)}"` : '';
        return `
          <div class="model-dropdown-item${isActive?' active':''}${isDisabled?' disabled':''}${isImgGroup?' img-model-item':''}"
               style="${isDisabled ? 'pointer-events:none' : ''}"
               ${tooltip}
               onclick="${isDisabled ? 'return false' : `selectModel('${m.id}')`}">
            <span class="model-dropdown-item-name">${esc(m.shortName||m.name)}</span>
            ${priceStr}
            ${isActive ? '<span style="color:var(--indigo-400);font-size:12px">✓</span>' : ''}
          </div>
        `;
      }).join('')}
    </div>`;
  }).join('');
}

function selectModel(modelId) {
  const prevModel = getActiveSession()?.model || STATE.settings.model;
  Analytics.track('model_switched', { from: prevModel, to: modelId });
  const session  = getActiveSession();
  const modelDef = MODELS_DATA.getModel(modelId);

  if (session) session.model = modelId;
  STATE.settings.model = modelId;

  // If this is an image-gen model, flag the session
  if (session && modelDef?.provider === 'image-gen') {
    session.imageMode     = true;
    session.imageProvider = modelDef.imageProvider;
    session.imageModel    = modelDef.imageModel;
  } else if (session) {
    session.imageMode = false;
  }

  STATE.ui.modelDropdownOpen = false;
  saveState();
  renderHeader();
  const dd = document.getElementById('model-dropdown');
  if (dd) dd.style.display = 'none';
  const label = modelDef?.provider === 'image-gen'
    ? `🎨 ${modelDef.name} — image mode`
    : `Model: ${modelDef?.name || modelId}`;
  toast(label, 'info', 2000);
}
window.selectModel = selectModel;


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
      <button class="attachment-del" onclick="removeAttachment('${a.id}')" aria-label="Remove attachment">✕</button>
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
<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-eval' 'unsafe-inline' 'self' https://unpkg.com; style-src 'unsafe-inline'">
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{margin:0;padding:12px;font-family:sans-serif}</style></head><body>
<div id="root"></div>
<script type="text/babel">
${artifact.code}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(typeof App !== 'undefined' ? App : () => React.createElement('div','Component')));
</script></body></html>`;
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
          <button class="artifact-modal-btn" onclick="document.getElementById('artifact-frame').contentWindow.location.reload()" aria-label="Reload artifact">↺</button>
          <button class="artifact-modal-close" onclick="document.getElementById('artifact-overlay').remove()" aria-label="Close artifact preview">✕</button>
        </div>
      </div>
      <iframe id="artifact-frame" class="artifact-frame" sandbox="allow-scripts" srcdoc="${srcdoc.replace(/"/g,'&quot;')}"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);
}

function handleSend() {
  let session = getActiveSession();
  if (!session) { session = createSession(); saveState(); renderSessionList(); }
  const input = document.getElementById('message-input');
  if (!input?.value.trim() && !STATE.attachments?.length) return;

  // Guard: no API key configured
  if (!checkApiKeyBeforeSend()) return;

  const userText = input.value.trim();

  // ── /imagine command — image generation shortcut ──────────────
  if (userText.startsWith('/imagine ') || userText.startsWith('/img ')) {
    // Parse flags: --provider <id>  --model <id>  --size WxH  --steps N
    let raw = userText.replace(/^\/(?:imagine|img)\s+/, '');
    const imgOpts = {};

    const flagRe = /--(?:provider|model|size|steps)\s+\S+/gi;
    for (const flagMatch of raw.matchAll(/--provider\s+(\S+)/gi))  imgOpts.provider = flagMatch[1];
    for (const flagMatch of raw.matchAll(/--model\s+(\S+)/gi))     imgOpts.model    = flagMatch[1];
    for (const flagMatch of raw.matchAll(/--size\s+(\d+x\d+)/gi)) {
      const [w, h] = flagMatch[1].split('x').map(Number);
      imgOpts.width = w; imgOpts.height = h;
    }
    for (const flagMatch of raw.matchAll(/--steps\s+(\d+)/gi))    imgOpts.steps    = parseInt(flagMatch[1], 10);

    // Remove all parsed flags from the prompt string
    const cleanPrompt = raw.replace(/--(?:provider|model|size|steps)\s+\S+/gi, '').trim();

    if (cleanPrompt) {
      input.value = '';
      autoResize(input);
      handleImageGeneration(session, cleanPrompt, imgOpts);
      return;
    }
  }

  // ── /web — explicit web search shortcut ───────────────────────
  if (userText.startsWith('/web ') || userText.startsWith('/search ')) {
    const query = userText.replace(/^\/(?:web|search)\s+/, '').trim();
    if (query) {
      input.value = '';
      autoResize(input);
      const msg = `Search the web for: ${query}`;
      addMessage(session.id, 'user', msg);
      sendMessageDirect(session, msg, msg);
      return;
    }
  }

  // ── /remember — save to persistent memory ─────────────────────
  if (userText.startsWith('/remember ') || userText.startsWith('/save ') || userText.startsWith('/mem ')) {
    const fact = userText.replace(/^\/(?:remember|save|mem)\s+/, '').trim();
    if (fact) {
      input.value = '';
      autoResize(input);
      const msg = `Please save this to your persistent memory: ${fact}`;
      addMessage(session.id, 'user', msg);
      sendMessageDirect(session, msg, msg);
      return;
    }
  }

  // ── /recall — search persistent memory ────────────────────────
  if (userText.startsWith('/recall ') || userText.startsWith('/memory ')) {
    const query = userText.replace(/^\/(?:recall|memory)\s+/, '').trim();
    if (query) {
      input.value = '';
      autoResize(input);
      const msg = `Search your persistent memory for anything related to: ${query}`;
      addMessage(session.id, 'user', msg);
      sendMessageDirect(session, msg, msg);
      return;
    }
  }

  // ── /recap — summarise this conversation ──────────────────────
  if (userText === '/recap' || userText === '/summary' || userText === '/tldr') {
    input.value = '';
    autoResize(input);
    const msg = 'Please give me a clear, structured summary of our conversation so far — covering the main topics, decisions made, and any open questions.';
    addMessage(session.id, 'user', msg);
    sendMessageDirect(session, msg, msg);
    return;
  }

  // ── /compress — save context state ────────────────────────────
  if (userText === '/compress' || userText === '/save-context') {
    input.value = '';
    autoResize(input);
    const msg = 'We are approaching the context limit. Summarise this conversation so far, capturing:\n1. Decisions made\n2. Current state of work\n3. What to do next\n4. Key context a fresh session needs';
    addMessage(session.id, 'user', msg);
    sendMessageDirect(session, msg, msg);
    return;
  }


  const messageContent = buildMessageContent(userText || '[Attachment]');
  addMessage(session.id, 'user', typeof messageContent === 'string' ? messageContent : userText);
  input.value = '';
  autoResize(input);
  STATE.ui.skillSuggestions = [];
  renderSkillSuggestions();
  sendMessageDirect(session, userText, messageContent);
}

// ============================================================
// Built-in Tool Definitions (sent to every model that supports tools)
// ============================================================
const BUILT_IN_TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate an image from a detailed text description. Use whenever the user asks you to create, draw, visualize, illustrate, or render something as an image.',
    schema: {
      type: 'object',
      properties: {
        prompt:   { type: 'string', description: 'Detailed visual description of the image to generate' },
        size:     { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions (default 1024x1024)' },
        provider: { type: 'string', enum: ['bfl', 'fal', 'replicate', 'comfyui'], description: 'Image provider (default: user setting)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information, news, facts, or anything that may have changed since your training. Always use this for recent events or when uncertain about facts.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Search your persistent memory for facts the user has shared in previous conversations. Always check memory when the user references past interactions or preferences.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_save',
    description: 'Save an important fact, preference, or piece of information to persistent memory for future sessions.',
    schema: {
      type: 'object',
      properties: {
        key:   { type: 'string', description: 'Short descriptive label (e.g. "preferred language", "project name")' },
        value: { type: 'string', description: 'The information to remember' },
        tags:  { type: 'array', items: { type: 'string' }, description: 'Optional topic tags' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression for arithmetic, percentages, unit conversions, or any numeric computation.',
    schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression, e.g. "sqrt(144)", "15% of 340", "(2^10) - 1"' },
      },
      required: ['expression'],
    },
  },
];

// ============================================================
// Tool Executor — runs a named tool and returns string result
// ============================================================
async function executeTool(toolName, input, session) {
  // Delegate super-agent tools to SuperAgent runtime (isSuperAdmin only)
  if (typeof AuthSystem !== 'undefined' && AuthSystem.isSuperAdmin?.() &&
      typeof SuperAgent !== 'undefined' && SuperAgent.config.isEnabled()) {
    const superToolNames = new Set(SuperAgent.tools.map(t => t.name));
    if (superToolNames.has(toolName)) {
      return await SuperAgent.executeSuperTool(toolName, input);
    }
  }
  switch (toolName) {

    case 'generate_image': {
      const imgSettings = STATE.settings.imageGen || {};
      const provider = input.provider || imgSettings.provider || 'fal';
      const apiKey   = STATE.apiKeys[provider] || imgSettings.apiKey || '';
      const [w, h]   = (input.size || '1024x1024').split('x').map(Number);
      // Model defaults are provider-specific — ImageRouter.DEFAULTS.model is a fal id
      // and must not be reused verbatim for fal/replicate.
      const model = provider === ImageRouter.DEFAULTS.provider
        ? ImageRouter.DEFAULTS.model
        : ImageRouter.MODELS[provider]?.[0]?.id;

      if (provider !== 'comfyui' && !apiKey) {
        return `⚠️ No API key configured for image provider "${provider}". Add it in Settings → Image Generation.`;
      }
      try {
        const result  = await ImageRouter.generate(input.prompt, {
          provider, model, width: w || 1024, height: h || 1024,
          apiKey, comfyUrl: imgSettings.comfyUrl || 'http://127.0.0.1:8188',
        });
        // Store image as a special content string; renderToolResult() will display it
        const imgSrc = result.dataUrl || result.url;
        return `__TOOL_IMAGE__:${JSON.stringify({
          src: imgSrc, prompt: input.prompt,
          provider: result.provider, model: result.model,
          width: result.width, height: result.height, seed: result.seed,
          timingS: (result.timingMs / 1000).toFixed(1),
        })}`;
      } catch (e) {
        const classified = classifyImageError(e, provider);
        return classified || `⚠️ Image generation failed: ${e.message}`;
      }
    }

    case 'web_search': {
      const result = await ApiRouter.webSearch(input.query, STATE.currentAbortController?.signal);
      return result;
    }

    case 'memory_recall': {
      const ws = MemorySystem.workspaces.getActive();
      if (!ws) return 'No active workspace — memory unavailable.';
      const memories = MemorySystem.memories.search(ws.id, input.query, 6);
      if (!memories.length) return `No memories found matching "${input.query}".`;
      return memories.map(m => `• **${m.key}**: ${m.value}`).join('\n');
    }

    case 'memory_save': {
      const ws = MemorySystem.workspaces.getActive();
      if (!ws) return 'No active workspace — memory unavailable.';
      MemorySystem.memories.add(ws.id, {
        key: input.key, value: input.value,
        tags: input.tags || [], source: 'tool',
      });
      return `✅ Saved to memory: "${input.key}"`;
    }

    case 'calculate': {
      try {
        // Reuse SuperAgent's dependency-free, eval-free math evaluator
        // (strict Math.* allowlist, ^ = exponent). See app/agent.js.
        const result = SuperAgent.calc(input.expression || '');
        return `${input.expression} = ${result}`;
      } catch (e) {
        return `Calculation error: ${e.message}`;
      }
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// ============================================================
// Agentic send — streams with tool-calling loop
// ============================================================
async function sendMessageDirect(session, userText, messageContent = null) {
  // ── Image-mode intercept ──────────────────────────────────
  if (session.imageMode) {
    // Strip /imagine prefix then parse the same flags as the handleSend /imagine handler
    let _raw = userText.replace(/^\/imagine\s*/i, '').trim();
    const _imgOpts = {
      provider: session.imageProvider,
      model:    session.imageModel,
    };
    for (const _m of _raw.matchAll(/--provider\s+(\S+)/gi))  _imgOpts.provider = _m[1];
    for (const _m of _raw.matchAll(/--model\s+(\S+)/gi))     _imgOpts.model    = _m[1];
    for (const _m of _raw.matchAll(/--size\s+(\d+x\d+)/gi)) {
      const [_w, _h] = _m[1].split('x').map(Number);
      _imgOpts.width = _w; _imgOpts.height = _h;
    }
    for (const _m of _raw.matchAll(/--steps\s+(\d+)/gi))     _imgOpts.steps = parseInt(_m[1], 10);
    const _cleanPrompt = _raw.replace(/--(?:provider|model|size|steps)\s+\S+/gi, '').trim();
    return handleImageGeneration(session, _cleanPrompt || _raw, _imgOpts);
  }

  const model    = session.model || STATE.settings.model;
  const modelDef = MODELS_DATA?.getModel(model);
  const provider = modelDef?.provider || 'anthropic';
  const apiKey   = STATE.apiKeys[provider];

  if (!apiKey) {
    toast(`No API key for ${provider}. Please configure it in Settings.`, 'error', 6000);
    setTimeout(() => { window.location.href = 'admin.html'; }, 1500);
    return;
  }

  // Build system prompt
  let systemPrompt = '';
  const ws = MemorySystem.workspaces.getActive();
  if (ws?.systemPromptPrefix) systemPrompt += ws.systemPromptPrefix + '\n\n';
  const memCtx = ws ? MemorySystem.memories.buildContext(ws.id, userText) : '';
  if (memCtx) systemPrompt += memCtx + '\n';
  const spEl = document.getElementById('system-prompt');
  systemPrompt += spEl?.value || session.systemPrompt || STATE.settings.defaultSystemPrompt;

  // User profile context — inject persona for every authenticated user
  if (typeof ProfileSystem !== 'undefined' && typeof AuthSystem !== 'undefined') {
    try {
      const profileUser = AuthSystem.getSession?.()?.username || AuthSystem.getCurrentUser?.()?.username;
      if (profileUser) {
        const prof = ProfileSystem.get(profileUser);
        // Admin override note goes before everything else
        if (prof.adminNote) {
          systemPrompt = prof.adminNote + '\n\n' + systemPrompt;
        }
        // User persona block prepended after admin note
        const profileCtx = ProfileSystem.buildSystemBlock(profileUser);
        if (profileCtx) {
          systemPrompt = profileCtx + '\n\n---\n\n' + systemPrompt;
        }
      }
    } catch (e) { console.warn('Profile injection failed:', e); }
  }

  // Super-admin agent: prepend persona + KB + cross-session memory context
  if (typeof AuthSystem !== 'undefined' && AuthSystem.isSuperAdmin?.() &&
      typeof SuperAgent !== 'undefined' && SuperAgent.config.isEnabled()) {
    try {
      const superPrompt = await SuperAgent.buildSuperAgentSystemPrompt(userText);
      if (superPrompt) systemPrompt = superPrompt + '\n\n---\n\n' + systemPrompt;
    } catch (e) { console.warn('SuperAgent prompt build failed:', e); }
  }

  // Inject skill prefix if queued
  let finalText = userText;
  if (STATE.ui.injectedSkill) {
    finalText = `Read and follow the **${STATE.ui.injectedSkill}** skill.\n\n${userText}`;
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg?.role === 'user') lastMsg.content = finalText;
    STATE.ui.injectedSkill = null;
    renderInjectedSkillTag();
  }

  // Convert session messages → API format (supports vision content arrays)
  function buildApiMessages(msgs) {
    return msgs
      .filter(m => !m.imageGenerating) // skip placeholder image messages
      .map((m, i) => {
        const isLastUser = m.role === 'user' && i === msgs.length - 1;
        if (isLastUser && messageContent && Array.isArray(messageContent)) {
          if (provider === 'anthropic') {
            const content = messageContent.map(p => {
              if (p._type === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.dataUrl.split(',')[1] } };
              return { type: 'text', text: p._type === 'text' ? p.text : p };
            });
            return { role: m.role, content };
          } else if (provider === 'google') {
            const parts = messageContent.map(p => {
              if (p._type === 'image') return { inlineData: { mimeType: p.mediaType, data: p.dataUrl.split(',')[1] } };
              return { text: p._type === 'text' ? p.text : p };
            });
            return { role: m.role, parts };
          } else {
            const content = messageContent.map(p => {
              if (p._type === 'image') return { type: 'image_url', image_url: { url: p.dataUrl } };
              return { type: 'text', text: p._type === 'text' ? p.text : p };
            });
            return { role: m.role, content };
          }
        }
        // Tool result messages
        if (m.role === 'tool') {
          if (provider === 'anthropic') {
            return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_use_id, content: m.content }] };
          }
          return { role: 'tool', tool_call_id: m.tool_use_id, content: m.content, name: m.name };
        }
        // Assistant messages that contain tool_use blocks
        if (m.role === 'assistant' && m.toolCalls?.length) {
          if (provider === 'anthropic') {
            const parts = [];
            if (m.content) parts.push({ type: 'text', text: m.content });
            for (const tc of m.toolCalls) {
              parts.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
            }
            return { role: 'assistant', content: parts };
          }
          // OpenAI format
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map(tc => ({
              id: tc.id, type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          };
        }
        return { role: m.role, content: m.content };
      });
  }

  STATE.streaming = true;
  STATE.currentAbortController = new AbortController();
  updateStreamingUI(true);
  renderMessages();
  showTypingIndicator();

  // Determine which tools to send (only for models that support function calling)
  const supportsTools = modelDef?.toolCalling !== false; // default true unless explicitly disabled
  let tools = supportsTools ? [...BUILT_IN_TOOLS] : [];

  // Super-admin: merge additional super-agent tools into the tool list
  if (supportsTools && typeof AuthSystem !== 'undefined' && AuthSystem.isSuperAdmin?.() &&
      typeof SuperAgent !== 'undefined' && SuperAgent.config.isEnabled()) {
    try {
      const superTools = SuperAgent.getSuperTools();
      if (superTools.length) tools = [...tools, ...superTools.filter(t => !tools.find(s => s.name === t.name))];
    } catch (e) { console.warn('SuperAgent getSuperTools failed:', e); }
  }

  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let totalCacheRead    = 0;
  const MAX_TOOL_ROUNDS = 8; // prevent infinite loops

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const apiMessages = buildApiMessages(session.messages);

      // Add empty assistant placeholder for this round
      const assistantMsgId = addMessage(session.id, 'assistant', '', {
        toolCalls: [], toolResults: [],
      });
      hideTypingIndicator();

      let accumulated  = '';
      let roundUsage   = null;
      const pendingToolCalls = []; // [{id, name, input}]

      for await (const chunk of ApiRouter.stream(
        provider, model, apiKey, apiMessages, systemPrompt,
        { maxTokens: STATE.settings.maxTokens, signal: STATE.currentAbortController.signal, tools }
      )) {
        // ── Text delta ──
        if (chunk.delta) {
          accumulated += chunk.delta;
          const msgObj = session.messages.find(m => m.id === assistantMsgId);
          if (msgObj) msgObj.content = accumulated;
          updateLastAssistantBubble(accumulated);
        }

        // ── Tool call arrived ──
        if (chunk.toolCall) {
          pendingToolCalls.push(chunk.toolCall);
          // Show tool-calling indicator in the bubble
          const msgObj = session.messages.find(m => m.id === assistantMsgId);
          if (msgObj) {
            msgObj.toolCalls = [...(msgObj.toolCalls || []), chunk.toolCall];
            renderMessages();
          }
        }

        if (chunk.done && chunk.usage) roundUsage = chunk.usage;
      }

      // Accumulate token usage across rounds
      if (roundUsage) {
        totalInputTokens  += roundUsage.inputTokens  || 0;
        totalOutputTokens += roundUsage.outputTokens || 0;
        totalCacheRead    += roundUsage.cacheReadTokens || 0;
      }

      // Finalise assistant message content
      const assistantMsgObj = session.messages.find(m => m.id === assistantMsgId);
      if (assistantMsgObj) assistantMsgObj.content = accumulated;

      // ── No tool calls → final response, break ──
      if (!pendingToolCalls.length) break;

      // ── Execute each tool and append results ──
      for (const tc of pendingToolCalls) {
        // Show "running" indicator
        if (assistantMsgObj) {
          const tcEntry = assistantMsgObj.toolCalls.find(t => t.id === tc.id);
          if (tcEntry) { tcEntry.running = true; renderMessages(); }
        }

        let resultText;
        try {
          resultText = await executeTool(tc.name, tc.input, session);
        } catch (e) {
          resultText = `Tool error: ${e.message}`;
        }

        // Mark tool as done in the assistant bubble
        if (assistantMsgObj) {
          const tcEntry = assistantMsgObj.toolCalls.find(t => t.id === tc.id);
          if (tcEntry) { tcEntry.running = false; tcEntry.result = resultText; }
        }

        // Append tool result as a special message (filtered into correct API format)
        addMessage(session.id, 'tool', resultText, {
          tool_use_id: tc.id,
          name: tc.name,
        });

        renderMessages();
        scrollToBottom();
      }

      showTypingIndicator();
    } // end round loop

  } catch (err) {
    hideTypingIndicator();
    if (err.name !== 'AbortError') {
      toast(`Error: ${err.message}`, 'error', 7000);
      console.error(err);
    } else {
      toast('Stopped', 'info');
    }
  } finally {
    // Apply accumulated cost to last assistant message
    const lastAssistant = [...session.messages].reverse().find(m => m.role === 'assistant' && !m.toolCalls?.length);
    if (lastAssistant && modelDef && (totalInputTokens || totalOutputTokens)) {
      const costResult = MODELS_DATA.calculateCost(model, totalInputTokens, totalOutputTokens, totalCacheRead);
      lastAssistant.usage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, cacheReadTokens: totalCacheRead };
      lastAssistant.cost  = costResult.totalCost;
      addCostToSession(session.id, costResult);
    }

    STATE.streaming = false;
    STATE.currentAbortController = null;
    updateStreamingUI(false);
    saveState();
    renderMessages();
    renderSessionList();
    updateCostDisplays();
    scrollToBottom();
    // ── Tab title + browser notification when AI finishes ────────────────
    if (!document.hasFocus()) {
      document.title = '✦ Ready — Async';
      setTimeout(() => { document.title = 'Async'; }, 4000);
      if (Notification.permission === 'granted') {
        new Notification('Async — Response ready', {
          body: getActiveSession()?.title || 'Your AI response is ready',
          icon: '/public/images/og-image.png',
          tag:  'async-response',
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    // ── Follow-up suggestions ─────────────────────────────────────
    if (typeof renderFollowupSuggestions === 'function') {
      renderFollowupSuggestions(getActiveSession());
    }
    // ─────────────────────────────────────────────────────────────
  }
}

// ---------------------------------------------------------------------------
// classifyImageError — convert a raw provider error into a structured error
// card string that renderMessages() will handle.
// Returns a string starting with __IMG_ERROR__: for special rendering, or a
// plain text fallback if something unexpected happened.
// ---------------------------------------------------------------------------
function classifyImageError(err, provider) {
  const msg = (err && err.message) ? err.message : String(err);

  // Detect categories
  const isAuth = /401|unauthenticated|authentication required|invalid.*key|missing.*key|api key is missing/i.test(msg);
  const isCredits = /402|insufficient credits|billing|payment/i.test(msg);
  const isPermission = /403|forbidden|no.*permission|cannot access/i.test(msg);
  const isRateLimit = /429|rate limit/i.test(msg);
  const isTransient = /502|503|504|upstream|timeout|temporarily unavailable|overloaded|server error|try again/i.test(msg);
  const isCancelled = /cancelled|aborted/i.test(msg);

  const providerLabel = { bfl: 'Black Forest Labs', fal: 'fal.ai', replicate: 'Replicate', comfyui: 'ComfyUI' }[provider] || provider || 'Image provider';

  let icon, title, body, action;

  if (isCancelled) {
    return null; // silent cancel
  } else if (isAuth || isCredits || isPermission) {
    icon = '🔑';
    title = isAuth ? 'API Key Required' : isCredits ? 'Insufficient Credits' : 'Access Denied';
    body = msg;
    action = isAuth
      ? '<a href="admin.html#settings" style="color:var(--primary-light);text-decoration:underline;">Open Settings → Image Generation →</a>'
      : `<a href="${provider === 'bfl' ? 'https://api.bfl.ml' : provider === 'fal' ? 'https://fal.ai/dashboard' : 'https://replicate.com/account/billing'}" target="_blank" rel="noopener" style="color:var(--primary-light);text-decoration:underline;">Open ${providerLabel} dashboard →</a>`;
  } else if (isRateLimit) {
    icon = '⏳';
    title = 'Rate Limit Reached';
    body = msg;
    action = 'Wait a moment, then try again.';
  } else if (isTransient) {
    icon = '🔄';
    title = 'Temporary Server Error';
    body = msg;
    action = 'This is a transient error. Wait 15–30 seconds and try again.';
  } else {
    icon = '⚠️';
    title = 'Generation Failed';
    body = msg;
    action = null;
  }

  return `__IMG_ERROR__:${JSON.stringify({ icon, title, body, action, provider: providerLabel })}`;
}

async function handleImageGeneration(session, prompt, opts = {}) {
  if (!session) { session = getActiveSession() || createSession(); saveState(); }

  const imgSettings = STATE.settings.imageGen || {};
  const provider = opts.provider || imgSettings.provider || 'fal';

  // Resolve model: explicit opt OR saved setting — but only if it belongs to this provider.
  // This prevents a BFL model ID (e.g. 'flux-pro-1.1') from being used as a fal.ai path.
  const providerModelIds = (ImageRouter.MODELS[provider] || []).map(m => m.id);
  const candidateModel = opts.model || imgSettings.model || null;
  const model = candidateModel && providerModelIds.includes(candidateModel)
    ? candidateModel
    : (ImageRouter.MODELS[provider]?.[0]?.id || null);

  const width    = opts.width    || imgSettings.width    || 1024;
  const height   = opts.height   || imgSettings.height   || 1024;
  const steps    = opts.steps    || imgSettings.steps    || 28;
  const apiKey   = opts.apiKey   || STATE.apiKeys[provider] || imgSettings.apiKey || '';
  const comfyUrl = imgSettings.comfyUrl || 'http://127.0.0.1:8188';

  if (provider !== 'comfyui' && !apiKey) {
    toast(`🎨 No API key for “${provider}” — add it in Settings → Image Generation`, 'warning');
    return;
  }

  // Add user message showing the prompt
  addMessage(session.id, 'user', `/imagine ${prompt}`);
  renderMessages();
  scrollToBottom();

  // Add placeholder assistant message while generating
  const placeholderId = addMessage(session.id, 'assistant', '', { imageGenerating: true, imagePrompt: prompt, imageProvider: provider });
  renderMessages();
  scrollToBottom();

  const startMs = Date.now();
  try {
    const result = await ImageRouter.generate(prompt, {
      provider,
      model: model || undefined,
      width, height, steps,
      apiKey,
      comfyUrl,
      num_images: opts.num_images,
      image_url: opts.image_url,
      mode: opts.mode,
      control_model: opts.control_model,
      strength: opts.strength,
      enable_safety_checker: opts.enable_safety_checker,
      safety_tolerance: opts.safety_tolerance,
    });

    const timingS = ((Date.now() - startMs) / 1000).toFixed(1);
    
    // Save image to IndexedDB and use db: key in JSON to prevent QuotaExceededError
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mainSrc = result.dataUrl || result.url;
    if (mainSrc && mainSrc.startsWith('data:')) {
      try {
        await ImageDb.set(imageId, mainSrc);
      } catch (err) {
        console.error('Failed to save main image to IndexedDB:', err);
      }
    }

    let batchImages = null;
    if (result.images && result.images.length > 0) {
      batchImages = await Promise.all(result.images.map(async (img, idx) => {
        const batchId = `${imageId}_b${idx}`;
        const src = img.dataUrl || img.url;
        if (src && src.startsWith('data:')) {
          try {
            await ImageDb.set(batchId, src);
          } catch (err) {
            console.error(`Failed to save batch image ${idx} to IndexedDB:`, err);
          }
          return { src: `db:${batchId}`, seed: img.seed };
        }
        return { src: img.url, seed: img.seed };
      }));
    }

    const content = `__IMAGE__:${JSON.stringify({
      src: mainSrc.startsWith('data:') ? `db:${imageId}` : mainSrc,
      prompt,
      provider: result.provider,
      model: result.model,
      width: result.width,
      height: result.height,
      seed: result.seed,
      timingS,
      images: batchImages
    })}`;

    // Update the placeholder message with real content
    const sess = STATE.sessions.find(s => s.id === session.id);
    const msg = sess?.messages.find(m => m.id === placeholderId);
    if (msg) {
      msg.content = content;
      msg.imageGenerating = false;
    }
    saveState();
    renderMessages();
    scrollToBottom();
  } catch (err) {
    const sess = STATE.sessions.find(s => s.id === session.id);
    const msg = sess?.messages.find(m => m.id === placeholderId);
    if (msg) {
      const classified = classifyImageError(err, provider);
      msg.content = classified || `⚠️ Image generation failed: ${err.message}`;
      msg.imageGenerating = false;
    }
    saveState();
    renderMessages();
    scrollToBottom();
    // Toast: short summary only (Settings link is in the chat card)
    const toastMsg = /api key|unauthenticated|authentication|401|403/i.test(err.message)
      ? `🔑 ${provider.toUpperCase()} API key missing or invalid — check Settings`
      : /upstream|timeout|502|503/i.test(err.message)
      ? `🔄 ${provider} is temporarily unavailable — try again shortly`
      : `🎨 Generation failed: ${err.message.slice(0, 80)}`;
    toast(toastMsg, 'error', 8000);
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
// Mobile off-canvas drawers (sidebar + skills-panel)
// Below 1024px both panels become fixed slide-in drawers (see the
// mobile block in styles.css) instead of squeezing into the flex row.
// These helpers derive backdrop/scroll-lock state fresh from
// STATE.ui every time, rather than an open-drawer counter, so it's
// correct regardless of how many drawers happen to be open at once.
// ============================================================
function isMobileViewport() {
  return window.matchMedia('(max-width: 1024px)').matches;
}

function syncDrawerState() {
  const backdrop = document.getElementById('drawer-backdrop');
  if (!backdrop) return;
  const anyOpen = isMobileViewport() && (!STATE.ui.sidebarCollapsed || STATE.ui.skillsPanelOpen);
  backdrop.classList.toggle('visible', anyOpen);
  if (anyOpen) {
    // iOS Safari fix: overflow:hidden on body does NOT prevent scroll.
    // Store current scroll position and use position:fixed instead.
    const scrollY = window.scrollY;
    document.documentElement.style.setProperty('--scroll-y', `${scrollY}px`);
    document.body.classList.add('drawer-open');
  } else {
    // Restore scroll position when drawer closes.
    const scrollY = parseFloat(
      document.documentElement.style.getPropertyValue('--scroll-y') || '0'
    );
    document.body.classList.remove('drawer-open');
    if (scrollY) window.scrollTo(0, scrollY);
  }
}

function closeMobileDrawers() {
  if (!isMobileViewport()) return;
  STATE.ui.sidebarCollapsed = true;
  STATE.ui.skillsPanelOpen = false;
  document.getElementById('sidebar')?.classList.add('collapsed');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) sidebarToggle.textContent = '▶';
  document.getElementById('skills-panel')?.classList.remove('open');
  document.getElementById('skills-toggle')?.classList.remove('active');
  syncDrawerState();
  saveState();
}

// ============================================================
// Event listeners
// ============================================================
function attachEventListeners() {
  window.addEventListener('cpu:memory-ready', () => {
    if (typeof renderWorkspaceBar === 'function') renderWorkspaceBar();
    const skillsPanel = document.getElementById('skills-panel');
    if (skillsPanel && skillsPanel.classList.contains('open')) {
      if (typeof renderMemoryList === 'function') renderMemoryList();
    }
  });

  document.getElementById('send-btn')?.addEventListener('click', handleSend);
  document.getElementById('stop-btn')?.addEventListener('click', stopStreaming);

  const input = document.getElementById('message-input');
  if (input) {
    input.addEventListener('input', onComposerInput);
    input.addEventListener('keydown', e => {
      // Slash picker navigation takes priority
      if (_slashNavKey(e)) return;
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

  document.getElementById('shortcuts-btn')?.addEventListener('click', showShortcutsModal);

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
    syncDrawerState();
    saveState();
  });

  document.getElementById('skills-toggle')?.addEventListener('click', () => {
    STATE.ui.skillsPanelOpen = !STATE.ui.skillsPanelOpen;
    document.getElementById('skills-panel')?.classList.toggle('open', STATE.ui.skillsPanelOpen);
    document.getElementById('skills-toggle')?.classList.toggle('active', STATE.ui.skillsPanelOpen);
    syncDrawerState();
    saveState();
  });

  document.getElementById('drawer-backdrop')?.addEventListener('click', closeMobileDrawers);

  // The sidebar's own toggle button lives inside the sidebar, so once it's
  // off-canvas on mobile there's no way to reach it — this header button
  // (visible only <1024px, see .mobile-sidebar-btn in styles.css) is the
  // reopen affordance, and just re-uses the same toggle logic.
  document.getElementById('mobile-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar-toggle')?.click();
  });

  // ── Swipe-to-close gestures for off-canvas drawers ──────────
  // Swipe left on the sidebar closes it. Swipe right on the skills panel
  // closes it. Only active on mobile viewport and only when the panel is open.
  (() => {
    let touchStartX = 0;
    let touchStartY = 0;
    const SWIPE_THRESHOLD = 60;   // px horizontal travel needed
    const DIRECTION_LOCK = 30;    // px vertical travel that cancels swipe

    function onTouchStart(e) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }

    function onSidebarTouchEnd(e) {
      if (!isMobileViewport() || STATE.ui.sidebarCollapsed) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      // Swipe left (negative dx) with small vertical movement → close sidebar
      if (dx < -SWIPE_THRESHOLD && dy < DIRECTION_LOCK) {
        document.getElementById('sidebar-toggle')?.click();
      }
    }

    function onSkillsTouchEnd(e) {
      if (!isMobileViewport() || !STATE.ui.skillsPanelOpen) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      // Swipe right (positive dx) with small vertical movement → close panel
      if (dx > SWIPE_THRESHOLD && dy < DIRECTION_LOCK) {
        document.getElementById('skills-toggle')?.click();
      }
    }

    const sidebar = document.getElementById('sidebar');
    const skillsPanel = document.getElementById('skills-panel');
    if (sidebar) {
      sidebar.addEventListener('touchstart', onTouchStart, { passive: true });
      sidebar.addEventListener('touchend', onSidebarTouchEnd, { passive: true });
    }
    if (skillsPanel) {
      skillsPanel.addEventListener('touchstart', onTouchStart, { passive: true });
      skillsPanel.addEventListener('touchend', onSkillsTouchEnd, { passive: true });
    }
  })();

  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(syncDrawerState, 150);
  });

  // ── visualViewport resize → detect virtual keyboard on mobile ──
  // When the virtual keyboard appears, the viewport height shrinks.
  // Compress the composer max-height so it doesn't steal all space.
  if (window.visualViewport) {
    const composerInput = document.getElementById('message-input');
    const baseHeight = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
      if (!composerInput) return;
      const shrinkRatio = window.visualViewport.height / baseHeight;
      // If height dropped by more than 30%, keyboard is up
      if (shrinkRatio < 0.7) {
        composerInput.style.maxHeight = '80px';
      } else {
        composerInput.style.maxHeight = '';
      }
    });
  }

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
      if (STATE.ui.modelDropdownOpen) {
        renderModelDropdown();
        // On phones (<480px), turn the dropdown into a bottom-sheet
        if (window.matchMedia('(max-width: 480px)').matches) {
          dd.classList.add('bottom-sheet');
        } else {
          dd.classList.remove('bottom-sheet');
        }
      }
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#model-selector-btn') && !e.target.closest('#model-dropdown')) {
      STATE.ui.modelDropdownOpen = false;
      const dd = document.getElementById('model-dropdown');
      if (dd) dd.style.display = 'none';
    }
  });

  document.getElementById('settings-btn')?.addEventListener('click', () => window.location.href = 'admin.html#settings');

  // Profile badge — init and keep in sync with saved profiles
  (function initProfileBadge() {
    if (typeof ProfileSystem === 'undefined' || typeof AuthSystem === 'undefined') return;
    try {
      const u = AuthSystem.getSession?.()?.username || AuthSystem.getCurrentUser?.()?.username;
      if (!u) return;
      const prof = ProfileSystem.get(u);
      const av = document.getElementById('sidebar-profile-avatar');
      const nm = document.getElementById('sidebar-profile-name');
      if (av) av.textContent = prof.avatarEmoji || '🧑';
      if (nm) nm.textContent = prof.displayName || u || 'My Profile';
    } catch {}
  })();
  window.addEventListener('profile-updated', () => {
    if (typeof ProfileSystem === 'undefined' || typeof AuthSystem === 'undefined') return;
    try {
      const u = AuthSystem.getSession?.()?.username || AuthSystem.getCurrentUser?.()?.username;
      if (!u) return;
      const prof = ProfileSystem.get(u);
      const av = document.getElementById('sidebar-profile-avatar');
      const nm = document.getElementById('sidebar-profile-name');
      if (av) av.textContent = prof.avatarEmoji || '🧑';
      if (nm) nm.textContent = prof.displayName || u || 'My Profile';
    } catch {}
  });

  document.getElementById('export-btn')?.addEventListener('click', exportSession);
  document.getElementById('share-btn')?.addEventListener('click', shareSession);
  document.getElementById('memory-btn')?.addEventListener('click', openMemoryPanel);
  document.getElementById('optimize-btn')?.addEventListener('click', optimizeCurrentPrompt);
  document.getElementById('cost-widget-btn')?.addEventListener('click', toggleCostBreakdown);

  // Wire voice input, session search, and img2img upload (defined in feature blocks)
  window._wireVoiceBtn?.();
  window._wireSessionSearchInput?.();
  window._wireImg2ImgUpload?.();

  document.addEventListener('keydown', e => {
    // Cmd+K → focus session search (overrides old new-chat shortcut)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const srch = document.getElementById('session-search');
      if (srch) { srch.focus(); srch.select(); }
      else { document.getElementById('message-input')?.focus(); }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      document.getElementById('skills-toggle')?.click();
    }
    if (e.key === 'Escape') {
      closeMemoryPanel();
      closeMobileDrawers();
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

      <!-- Shared backdrop for mobile off-canvas sidebar/skills-panel -->
      <div class="drawer-backdrop" id="drawer-backdrop"></div>

      <!-- ── Sidebar ────────────────────────────────── -->
      <aside class="sidebar" id="sidebar">

        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-logo">✦</div>
            <span class="brand-name sidebar-text">Async</span>
          </div>
          <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar" aria-label="Toggle sidebar">◀</button>
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

        <!-- Session search -->
        <div class="session-search-wrap sidebar-text" id="session-search-wrap">
          <input class="session-search-input" id="session-search" type="search" placeholder="🔍  Search chats…" autocomplete="off" />
        </div>

        <!-- Session list -->
        <div class="session-list" id="session-list"></div>

        <!-- Footer -->
        <div class="sidebar-footer">
          <button class="sidebar-footer-btn sidebar-text" id="profile-btn"
            onclick="if(typeof ProfileSystem!=='undefined'&&typeof AuthSystem!=='undefined'){const u=AuthSystem.getSession?.()?.username||AuthSystem.getCurrentUser?.()?.username||'user';ProfileSystem.open(u);}"
            title="Edit your profile & AI persona"
            style="display:flex;align-items:center;gap:8px;font-weight:500;border-bottom:1px solid rgba(255,255,255,.05);padding-bottom:8px;margin-bottom:4px">
            <span id="sidebar-profile-avatar" style="font-size:18px;line-height:1">🧑</span>
            <span id="sidebar-profile-name" style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">My Profile</span>
            <span style="font-size:10px;color:var(--text-muted,#64748b);flex-shrink:0">✏</span>
          </button>
          <button class="sidebar-footer-btn sidebar-text" id="settings-btn">⚙ Settings</button>
          <button class="sidebar-footer-btn sidebar-text" id="shortcuts-btn" title="Keyboard shortcuts">? Help</button>
          <button class="status-cost sidebar-text" id="cost-widget-btn" title="Click for cost breakdown" style="cursor:pointer;background:none;border:none;display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:6px;">
            <span class="status-cost-label">💰</span>
            <span class="status-cost-value" id="status-cost-value">Today: $0</span>
          </button>
        </div>
      </aside>

      <!-- ── Main content ───────────────────────────── -->
      <main class="main-content">

        <!-- Header -->
        <header class="chat-header">
          <div class="header-left">
            <button class="mobile-sidebar-btn" id="mobile-sidebar-btn" aria-label="Open sidebar">☰</button>
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
            <button class="icon-btn" id="export-btn" title="Export conversation (Markdown)" aria-label="Export conversation">⇧</button>
            <button class="icon-btn" id="share-btn" title="Share conversation (read-only link)" aria-label="Share conversation">🔗</button>
            <button class="icon-btn" id="skills-toggle" title="Toggle AI Tools panel (⌘/)" aria-label="Toggle AI Tools panel"><span style="font-size:13px">⋞</span> <span style="font-size:11px">Tools</span></button>
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
                  placeholder="Ask anything…"
                  rows="1"
                  inputmode="text"
                  enterkeyhint="send"
                ></textarea>
              </div>
              <div class="composer-toolbar">
                <button class="composer-system-btn" id="system-prompt-toggle" title="Add custom instructions">📋 Instructions</button>
                <label class="composer-attach-btn" title="Attach file (image, text, PDF, code)" for="file-input">📎 Attach</label>
                <input type="file" id="file-input" style="display:none" multiple accept="image/*,.txt,.md,.js,.ts,.py,.json,.csv,.html,.css,.pdf" />
                <button class="composer-imagine-btn" id="imagine-btn" title="Generate an image (or type /imagine ...)"
                  onclick="toggleImagePopover()">🎨 Imagine</button>
                <button class="composer-voice-btn" id="voice-btn" title="Voice input (hold to record)" aria-label="Voice input">🎙</button>
                <button class="composer-optimize-btn" id="optimize-btn" title="Improve my prompt" aria-label="Improve prompt">✨</button>
                <div class="composer-spacer"></div>
                <button class="send-btn" id="send-btn">↑ Send</button>
                <button class="stop-btn" id="stop-btn" style="display:none">⏹ Stop</button>
              </div>
              <!-- Image generation popover -->
              <div class="image-popover" id="image-popover" style="display:none">
                <div class="image-popover-header">
                  <span>🎨 Generate Image</span>
                  <button class="image-popover-close" onclick="toggleImagePopover()" aria-label="Close image generator">✕</button>
                </div>
                <textarea class="image-popover-prompt" id="imagine-prompt"
                  placeholder="Describe the image…" rows="3"></textarea>
                <div class="image-popover-row">
                  <select class="image-popover-select" id="imagine-provider" onchange="updateImagineModels()">
                    <option value="bfl">Black Forest Labs</option>
                    <option value="fal">fal.ai</option>
                    <option value="replicate">Replicate</option>
                    <option value="novita">Novita AI</option>
                    <option value="huggingface">🤗 HuggingFace</option>
                    <option value="comfyui">ComfyUI (local)</option>
                  </select>
                  <select class="image-popover-select" id="imagine-model">
                    <option value="flux-pro-1.1">Flux Pro 1.1</option>
                  </select>
                </div>
                <div class="image-popover-row">
                  <select class="image-popover-select" id="imagine-size">
                    <option value="1024x1024">1024 × 1024</option>
                    <option value="1440x1024">1440 × 1024 (wide)</option>
                    <option value="1024x1440">1024 × 1440 (tall)</option>
                    <option value="768x768">768 × 768 (fast)</option>
                  </select>
                </div>
                <!-- Advanced options -->
                <div class="image-popover-row" id="imagine-qty-row" style="display:none; justify-content:space-between; align-items:center;">
                  <span style="font-size:12px; color:var(--text-muted);">Quantity:</span>
                  <select class="image-popover-select" id="imagine-qty" style="width:auto; min-width:80px;">
                    <option value="1">1 Image</option>
                    <option value="2">2 Images</option>
                    <option value="4">4 Images</option>
                  </select>
                </div>
                <div id="imagine-fal-extras" style="display:none; border-top:1px solid var(--border-color); margin-top:8px; padding-top:8px;">
                  <div class="image-popover-row" style="justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:12px; color:var(--text-muted);">Mode:</span>
                    <select class="image-popover-select" id="imagine-mode" onchange="syncImagineModeFields()" style="width:auto; min-width:140px;">
                      <option value="text2img">Text to Image</option>
                      <option value="img2img">Image to Image</option>
                      <option value="controlnet">Pose Control</option>
                      <option value="redux">Style Transfer (Redux)</option>
                    </select>
                  </div>
                  <div id="imagine-ref-row" style="display:none; margin-bottom:8px;">
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Reference Image:</div>
                    <!-- File upload drop zone -->
                    <div class="img2img-dropzone" id="img2img-dropzone" title="Click or drag an image here">
                      <input type="file" id="img2img-file" accept="image/*" style="display:none" />
                      <span class="img2img-dropzone-label" id="img2img-dropzone-label">🖼️ Drop image or click to upload</span>
                    </div>
                    <div style="font-size:10px;color:var(--text-muted);text-align:center;margin:4px 0">— or paste a URL —</div>
                    <input type="text" class="image-popover-input" id="imagine-image-url" placeholder="https://example.com/image.jpg" style="width:100%; box-sizing:border-box; background:var(--bg-app); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; font-size:12px; margin-bottom:8px;" />
                    <div class="image-popover-row" id="imagine-strength-row" style="justify-content:space-between; align-items:center;">
                      <span style="font-size:12px; color:var(--text-muted);">Strength:</span>
                      <input type="range" id="imagine-strength" min="0.1" max="1.0" step="0.05" value="0.5" style="flex:1; margin:0 12px; cursor:pointer;" oninput="document.getElementById('imagine-strength-val').textContent = this.value" />
                      <span id="imagine-strength-val" style="font-size:12px; color:var(--text-main); font-family:monospace; min-width:24px; text-align:right;">0.5</span>
                    </div>
                  </div>
                  <!-- Safety filters (added to resolve content policy block issues) -->
                  <div class="image-popover-row" style="justify-content:space-between; align-items:center; margin-top:8px;">
                    <span style="font-size:12px; color:var(--text-muted);">Safety Filter:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <select class="image-popover-select" id="imagine-safety-tolerance" style="width:auto; font-size:12px; padding:4px 8px; min-width:110px;">
                        <option value="2">Standard (2)</option>
                        <option value="1">Strict (1)</option>
                        <option value="3">Permissive (3)</option>
                        <option value="4">Highly Permissive (4)</option>
                        <option value="5">Unfiltered (5)</option>
                      </select>
                      <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; color:var(--text-muted);">
                        <input type="checkbox" id="imagine-safety-checker" checked style="cursor:pointer;" /> Enable
                      </label>
                    </div>
                  </div>
                </div>
                <!-- HuggingFace extras -->
                <div id="imagine-hf-extras" style="display:none; border-top:1px solid var(--border-color); margin-top:8px; padding-top:8px;">
                  <div style="display:flex; align-items:flex-start; gap:8px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:6px; padding:8px 10px;">
                    <span style="font-size:16px; flex-shrink:0;">🤗</span>
                    <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
                      <strong style="color:var(--text-main); font-size:12px;">HuggingFace Inference API</strong><br>
                      Select any open-source text-to-image model. First run may take <strong style="color:#f59e0b;">20–60 s</strong> while the model warms up — the app retries automatically.<br>
                      <span style="opacity:0.7;">Requires a HuggingFace token saved in Settings → Image Generation.</span>
                    </div>
                  </div>
                  <div class="image-popover-row" style="justify-content:space-between; align-items:center; margin-top:8px;">
                    <span style="font-size:12px; color:var(--text-muted);">Steps:</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <input type="range" id="imagine-hf-steps" min="10" max="50" step="1" value="28"
                        style="flex:1; width:100px; cursor:pointer;"
                        oninput="document.getElementById('imagine-hf-steps-val').textContent = this.value" />
                      <span id="imagine-hf-steps-val" style="font-size:12px; color:var(--text-main); font-family:monospace; min-width:22px; text-align:right;">28</span>
                    </div>
                  </div>
                </div>
                <button class="image-popover-generate" onclick="generateFromPopover()">🎨 Generate</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- ── Skills panel ───────────────────────────── -->
      <aside class="skills-panel ${STATE.ui.skillsPanelOpen ? 'open' : ''}" id="skills-panel">
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

async function migrateImagesToDb() {
  let migratedAny = false;
  if (!STATE.sessions || !STATE.sessions.length) return;
  
  for (const session of STATE.sessions) {
    if (!session.messages) continue;
    for (const msg of session.messages) {
      if (msg.content && msg.content.startsWith('__IMAGE__:')) {
        try {
          const imgData = JSON.parse(msg.content.slice(10));
          if (!imgData) continue;
          
          let changed = false;
          
          // Migrate main image
          if (imgData.src && imgData.src.startsWith('data:')) {
            const imageId = `img_migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await ImageDb.set(imageId, imgData.src);
            imgData.src = `db:${imageId}`;
            changed = true;
          }
          
          // Migrate batch images
          if (imgData.images && imgData.images.length > 0) {
            for (let idx = 0; idx < imgData.images.length; idx++) {
              const img = imgData.images[idx];
              if (img.src && img.src.startsWith('data:')) {
                const batchId = `img_migrated_${Date.now()}_b${idx}_${Math.random().toString(36).substr(2, 9)}`;
                await ImageDb.set(batchId, img.src);
                img.src = `db:${batchId}`;
                changed = true;
              }
            }
          }
          
          if (changed) {
            msg.content = `__IMAGE__:${JSON.stringify(imgData)}`;
            migratedAny = true;
          }
        } catch (e) {
          console.error('Error migrating image to IndexedDB:', e);
        }
      }
    }
  }
  
  if (migratedAny) {
    console.log('Successfully migrated legacy base64 images to IndexedDB');
    saveState();
  }
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
          Async must be served over HTTP — not opened as a local file.
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

  // 0c. A logged-in session can still be carrying a not-yet-changed default
  // password (see checkPasswordChangeRequired() in auth.js) — block booting
  // the app until that's resolved, not just on the initial login submit.
  if (AuthSystem.checkPasswordChangeRequired()) return;

  // Track login session
  Analytics.track('login', { username: AuthSystem.getCurrentSession()?.username });

  // 1. Init memory system (ensures Default workspace exists)
  MemorySystem.init();

  // 2. Probe local server (enables disk persistence + SSE sync)
  const serverUp = await ServerSync.probe();

  // 3. Load persisted state
  await loadState();
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

  // Auto-migrate legacy base64 images to IndexedDB to free up localStorage space
  await migrateImagesToDb();

  // 4. Load encrypted API keys from vault
  const vaultResult = await ApiKeyVault.load();
  if (vaultResult === null && ApiKeyVault.hasVault()) {
    // Vault exists but session key is missing — prompt after render
    setTimeout(_showVaultUnlockModal, 600);
  } else if (vaultResult && typeof vaultResult === 'object') {
    Object.assign(STATE.apiKeys, vaultResult);
  }

  // 4b. On a narrow viewport, force both drawers closed for this session
  // regardless of whatever was persisted from a desktop session — this is
  // in-memory only (not saved here), so a returning desktop user's actual
  // preference is untouched and still applies when they're back on a wide
  // viewport.
  if (isMobileViewport()) {
    STATE.ui.sidebarCollapsed = true;
    STATE.ui.skillsPanelOpen = false;
  }

  // 5. Build DOM
  buildHTML();

  // 6. Attach all events
  attachEventListeners();

  // 7. Ensure at least one session
  if (!STATE.sessions.length) {
    createSession('New Conversation — Async');
  }

  // 8. Restore sidebar collapsed state
  if (STATE.ui.sidebarCollapsed) {
    document.getElementById('sidebar')?.classList.add('collapsed');
    const toggle = document.getElementById('sidebar-toggle');
    if (toggle) toggle.textContent = '▶';
  }
  // 8b. Sync skills panel open/closed state to DOM (ensures mobile-closed
  // state is reflected even if the HTML was rendered from a stale value).
  const skillsPanel = document.getElementById('skills-panel');
  const skillsToggle = document.getElementById('skills-toggle');
  if (skillsPanel) {
    skillsPanel.classList.toggle('open', STATE.ui.skillsPanelOpen);
  }
  if (skillsToggle) {
    skillsToggle.classList.toggle('active', STATE.ui.skillsPanelOpen);
  }
  syncDrawerState();

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
  console.log(`❆ Async v2 ready — ${SKILLS_DATA.totalCount} skills · ${Object.keys(MODELS_DATA.providers).length} providers · ${STATE.sessions.length} sessions · sync:${syncMode} · api:${apiMode}`);

  // 16. First-run onboarding (shown once per device)
  setTimeout(() => showOnboardingIfNeeded(), 600);
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
  const userObj  = AuthSystem.getCurrentUser();
  const isAdmin      = session?.role === 'admin' || userObj?.role === 'admin';
  const isSuperAdmin = typeof AuthSystem !== 'undefined' && AuthSystem.isSuperAdmin?.();

  // Find or create badge container in header
  const header = document.querySelector('.chat-header');
  if (!header) return;

  // Remove existing badge if any
  document.getElementById('user-badge-wrap')?.remove();

  const wrap = document.createElement('div');
  wrap.id = 'user-badge-wrap';
  wrap.style.cssText = 'position:relative;display:flex;align-items:center;gap:6px;margin-left:4px';

  const badgeLabel = isSuperAdmin ? 'SUPER' : (isAdmin ? 'ADMIN' : 'USER');
  const badgeClass = isSuperAdmin ? 'admin' : (isAdmin ? 'admin' : 'user');

  wrap.innerHTML = `
    <div class="user-badge" id="user-badge-btn" title="${esc(user.displayName || user.username)}">
      <div class="user-avatar">${initials}</div>
      <span class="user-badge-name">${esc(user.displayName || user.username)}</span>
      <span class="user-badge-role ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="user-menu-dropdown" id="user-menu" style="display:none">
      <div style="padding:8px 12px 6px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">
        Signed in as @${esc(user.username)}
      </div>
      <div class="user-menu-divider"></div>
      ${isAdmin ? `<button class="user-menu-item" onclick="window.open('admin.html','_blank')">
        <span>◈</span> Admin Dashboard
      </button>` : ''}
      ${isSuperAdmin ? `<button class="user-menu-item" onclick="window.location.href='agent-chat.html'" style="color:#818cf8;font-weight:600">
        <span>✦</span> Aria — Super Agent
      </button>` : ''}
      <button class="user-menu-item" onclick="window.location.href='gallery.html'">
        <span>🖼</span> Media Gallery
      </button>
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

// ============================================================
// Image popover helpers
// ============================================================
function toggleImagePopover() {
  const pop = document.getElementById('image-popover');
  if (!pop) return;
  const isVisible = pop.style.display !== 'none';
  pop.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    // Pre-fill provider from settings, sync model list
    const savedProvider = STATE.settings.imageGen?.provider || 'fal';
    const providerSel = document.getElementById('imagine-provider');
    if (providerSel) providerSel.value = savedProvider;
    updateImagineModels();
    document.getElementById('imagine-prompt')?.focus();
  }
}

function updateImagineModels() {
  const providerSel = document.getElementById('imagine-provider');
  const modelSel    = document.getElementById('imagine-model');
  if (!providerSel || !modelSel || typeof ImageRouter === 'undefined') return;
  const models = ImageRouter.MODELS[providerSel.value] || [];
  modelSel.innerHTML = models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  syncImaginePopoverFields();
}

function syncImaginePopoverFields() {
  const provider = document.getElementById('imagine-provider')?.value;
  const qtyRow    = document.getElementById('imagine-qty-row');
  const falExtras = document.getElementById('imagine-fal-extras');
  const hfExtras  = document.getElementById('imagine-hf-extras');

  // fal.ai: show quantity + mode extras
  if (provider === 'fal') {
    if (qtyRow)    qtyRow.style.display    = 'flex';
    if (falExtras) falExtras.style.display = 'block';
    if (hfExtras)  hfExtras.style.display  = 'none';
    syncImagineModeFields();
  } else if (provider === 'huggingface') {
    if (qtyRow)    qtyRow.style.display    = 'none';
    if (falExtras) falExtras.style.display = 'none';
    if (hfExtras)  hfExtras.style.display  = 'block';
  } else {
    if (qtyRow)    qtyRow.style.display    = 'none';
    if (falExtras) falExtras.style.display = 'none';
    if (hfExtras)  hfExtras.style.display  = 'none';
  }
}

function syncImagineModeFields() {
  const mode = document.getElementById('imagine-mode')?.value;
  const refRow = document.getElementById('imagine-ref-row');
  const strengthRow = document.getElementById('imagine-strength-row');
  
  if (refRow) {
    if (mode && mode !== 'text2img') {
      refRow.style.display = 'block';
      if (strengthRow) {
        strengthRow.style.display = (mode === 'redux') ? 'none' : 'flex';
      }
    } else {
      refRow.style.display = 'none';
    }
  }
}
function generateFromPopover() {
  const prompt   = document.getElementById('imagine-prompt')?.value.trim();
  const provider = document.getElementById('imagine-provider')?.value;
  const model    = document.getElementById('imagine-model')?.value;
  const sizeVal  = document.getElementById('imagine-size')?.value || '1024x1024';
  const [width, height] = sizeVal.split('x').map(Number);

  const num_images = provider === 'fal' ? parseInt(document.getElementById('imagine-qty')?.value || '1', 10) : 1;
  const mode = provider === 'fal' ? (document.getElementById('imagine-mode')?.value || 'text2img') : 'text2img';
  const image_url = provider === 'fal' ? (document.getElementById('imagine-image-url')?.value.trim() || null) : null;
  const strength = provider === 'fal' ? parseFloat(document.getElementById('imagine-strength')?.value || '0.5') : 0.5;
  const enable_safety_checker = provider === 'fal' ? document.getElementById('imagine-safety-checker')?.checked : true;
  const safety_tolerance = provider === 'fal' ? (document.getElementById('imagine-safety-tolerance')?.value || '2') : '2';

  // HuggingFace-specific: steps from the HF slider
  const steps = provider === 'huggingface'
    ? parseInt(document.getElementById('imagine-hf-steps')?.value || '28', 10)
    : undefined; // undefined → handleImageGeneration uses its own default

  if (!prompt) {
    toast('🎨 Please enter an image description', 'warning');
    return;
  }

  toggleImagePopover(); // close popover
  const session = getActiveSession() || createSession();
  handleImageGeneration(session, prompt, {
    provider, model, width, height,
    ...(steps !== undefined ? { steps } : {}),
    num_images, mode, image_url, strength,
    enable_safety_checker, safety_tolerance
  });
}


// ============================================================
// Onboarding Modal — shown once on first run
// ============================================================
const ONBOARDING_KEY = 'async_onboarded_v1';

function showOnboardingIfNeeded() {
  if (localStorage.getItem(ONBOARDING_KEY)) return;
  // Don't show during password-change flow
  if (document.getElementById('force-pw-overlay')) return;
  showOnboardingModal();
}

function showOnboardingModal() {
  const steps = [
    {
      icon: '✦',
      title: 'Welcome to Async',
      body: 'Your private AI workspace — bring any model, keep all your conversations, and generate images. Let\'s take a 30-second tour.',
      action: 'Get Started →',
    },
    {
      icon: '🔑',
      title: 'Add Your API Keys',
      body: 'Async connects directly to AI providers using <em>your own API keys</em>. No markup, no hidden costs — you pay providers at their published rates.',
      action: 'Set Up Keys in Settings',
      actionHref: 'admin.html#api-keys',
      skipLabel: 'Skip for now',
    },
    {
      icon: '/',
      title: 'Slash Commands',
      body: 'Type <code>/</code> in the composer to open the command menu:<br><br>' +
            '<code>/imagine</code> — generate images<br>' +
            '<code>/web</code> — search the web<br>' +
            '<code>/remember</code> — save a memory<br>' +
            '<code>/recap</code> — summarise the chat',
      action: 'Got it →',
    },
    {
      icon: '🖼',
      title: 'Media Gallery',
      body: 'Every image you generate is saved to your <strong>Media Gallery</strong> — accessible from the user menu at the top right. Your creative history, always available.',
      action: 'Open Gallery',
      actionHref: 'gallery.html',
      skipLabel: 'Start Chatting',
    },
  ];

  let step = 0;

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';

  function render() {
    const s = steps[step];
    overlay.innerHTML = `
      <div class="onboarding-card" role="dialog" aria-modal="true" aria-label="Welcome to Async">
        <div class="onboarding-progress">
          ${steps.map((_, i) => `<div class="onboarding-dot${i <= step ? ' done' : ''}"></div>`).join('')}
        </div>
        <button class="onboarding-close" id="onboarding-dismiss" aria-label="Close onboarding">✕</button>
        <div class="onboarding-icon">${s.icon}</div>
        <h2 class="onboarding-title">${s.title}</h2>
        <p class="onboarding-body">${s.body}</p>
        <div class="onboarding-actions">
          ${s.actionHref
            ? `<a class="onboarding-btn-primary" href="${s.actionHref}">${s.action}</a>`
            : `<button class="onboarding-btn-primary" id="onboarding-next">${s.action}</button>`
          }
          ${s.skipLabel ? `<button class="onboarding-btn-skip" id="onboarding-skip">${s.skipLabel}</button>` : ''}
        </div>
        <div class="onboarding-step-counter">${step + 1} of ${steps.length}</div>
      </div>
    `;
    overlay.querySelector('#onboarding-dismiss')?.addEventListener('click', closeOnboarding);
    overlay.querySelector('#onboarding-next')?.addEventListener('click', () => {
      if (step < steps.length - 1) { step++; render(); }
      else closeOnboarding();
    });
    overlay.querySelector('#onboarding-skip')?.addEventListener('click', closeOnboarding);
  }

  function closeOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    overlay.classList.add('onboarding-out');
    setTimeout(() => overlay.remove(), 300);
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) closeOnboarding(); });
  document.body.appendChild(overlay);
  render();
  // Trigger enter animation
  requestAnimationFrame(() => overlay.classList.add('onboarding-in'));
}

// ============================================================
// No-API-Key Interstitial Guard
// ============================================================
function checkApiKeyBeforeSend() {
  const hasAnyKey = STATE.apiKeys && Object.values(STATE.apiKeys).some(v => v?.length > 5);
  if (hasAnyKey) return true; // all good, proceed with send

  // Show a non-blocking modal pointing to Settings
  const existing = document.getElementById('no-key-interstitial');
  if (existing) return false;

  const el = document.createElement('div');
  el.id = 'no-key-interstitial';
  el.className = 'no-key-interstitial';
  el.innerHTML = `
    <div class="no-key-card" role="alertdialog" aria-label="API key required">
      <div class="no-key-icon">🔑</div>
      <h3 class="no-key-title">API Key Required</h3>
      <p class="no-key-body">
        Async needs an API key to send messages.<br>
        Add one in <strong>Settings → API Keys</strong> — it takes under a minute.
      </p>
      <div class="no-key-actions">
        <a class="no-key-btn-primary" href="admin.html#api-keys">Open Settings →</a>
        <button class="no-key-btn-skip" id="no-key-dismiss">Dismiss</button>
      </div>
    </div>
  `;
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  el.querySelector('#no-key-dismiss')?.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  // Animate in
  requestAnimationFrame(() => el.classList.add('no-key-in'));
  return false;
}

// ============================================================
// Session Search
// ============================================================
(function wireSessionSearch() {
  let _searchTimer;
  function doSessionSearch(q) {
    const list = document.getElementById('session-list');
    if (!list) return;
    if (!q) {
      // Reset: show all
      list.querySelectorAll('.session-item').forEach(el => el.style.display = '');
      return;
    }
    const lower = q.toLowerCase();
    list.querySelectorAll('.session-item').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(lower) ? '' : 'none';
    });
  }

  // Wire up — called after DOM is ready
  window._wireSessionSearchInput = function() {
    const input = document.getElementById('session-search');
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => doSessionSearch(input.value.trim()), 150);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = ''; doSessionSearch(''); input.blur(); }
    });
    // Cmd+K or Ctrl+K to focus search
    document.addEventListener('keydown', ev => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
        ev.preventDefault();
        input.focus();
        input.select();
      }
    });
  };
})();

// ============================================================
// Keyboard Shortcuts Modal
// ============================================================
const SHORTCUTS = [
  { key: '⌘⏎',      desc: 'Send message' },
  { key: '⌘K',      desc: 'Search conversations' },
  { key: '⌘/',      desc: 'Toggle AI Tools panel' },
  { key: '⌘⇧A',    desc: 'Open Admin Dashboard (admin only)' },
  { key: '/',         desc: 'Open slash command picker' },
  { key: '↑↓',       desc: 'Navigate slash command picker' },
  { key: 'Esc',       desc: 'Close picker / modal' },
  { key: 'Tab / ↵',  desc: 'Select slash command' },
  { key: '⌘⇧E',    desc: 'Export conversation (Markdown)' },
];

function showShortcutsModal() {
  const existing = document.getElementById('shortcuts-modal-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-modal-overlay';
  overlay.className = 'shortcuts-overlay';
  overlay.innerHTML = `
    <div class="shortcuts-card" role="dialog" aria-label="Keyboard shortcuts">
      <div class="shortcuts-header">
        <span class="shortcuts-title">⌨ Keyboard Shortcuts</span>
        <button class="shortcuts-close" id="shortcuts-close" aria-label="Close">✕</button>
      </div>
      <div class="shortcuts-list">
        ${SHORTCUTS.map(s => `
          <div class="shortcuts-item">
            <kbd class="shortcuts-key">${s.key}</kbd>
            <span class="shortcuts-desc">${s.desc}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#shortcuts-close')?.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('shortcuts-in'));

  // Also wire ? key globally (once)
  if (!window._shortcutsKeyWired) {
    window._shortcutsKeyWired = true;
    document.addEventListener('keydown', e => {
      if (e.key === '?' && !e.target.closest('input,textarea,[contenteditable]')) {
        showShortcutsModal();
      }
    });
  }
}

// ============================================================
// Voice Input (Web Speech API)
// ============================================================
(function wireVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return; // browser doesn't support it

  let recognition;
  let listening = false;

  function getVoiceBtn() { return document.getElementById('voice-btn'); }

  function startListening() {
    const input = document.getElementById('message-input');
    if (!input) return;

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    const btn = getVoiceBtn();
    if (btn) { btn.classList.add('voice-listening'); btn.title = 'Listening… click to stop'; }
    listening = true;

    let finalTranscript = input.value;

    recognition.addEventListener('result', e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      input.value = finalTranscript + interim;
      autoResize(input);
    });

    recognition.addEventListener('end', () => {
      input.value = finalTranscript.trim();
      autoResize(input);
      stopListening();
    });

    recognition.addEventListener('error', (e) => {
      if (e.error !== 'aborted') toast(`🎙 Voice input error: ${e.error}`, 'warning');
      stopListening();
    });

    recognition.start();
  }

  function stopListening() {
    recognition?.stop();
    listening = false;
    const btn = getVoiceBtn();
    if (btn) { btn.classList.remove('voice-listening'); btn.title = 'Voice input'; }
  }

  // Wire on DOM ready — called from attachEventListeners via _wireVoiceBtn
  window._wireVoiceBtn = function() {
    const btn = document.getElementById('voice-btn');
    if (!btn || !SpeechRecognition) {
      btn?.setAttribute('title', 'Voice input not supported in this browser');
      btn?.setAttribute('disabled', 'true');
      return;
    }
    btn.addEventListener('click', () => {
      if (listening) stopListening();
      else startListening();
    });
  };
})();

// ============================================================
// Prompt Optimizer (✨ Improve button)
// ============================================================
async function optimizeCurrentPrompt() {
  const input = document.getElementById('message-input');
  if (!input || !input.value.trim()) {
    toast('✨ Type a prompt first, then click Improve', 'info');
    return;
  }
  const btn = document.getElementById('optimize-btn');
  const originalPrompt = input.value.trim();
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const hasKey = STATE.apiKeys && Object.values(STATE.apiKeys).some(v => v?.length > 5);
    if (!hasKey) { toast('✨ Add an API key in Settings to use prompt optimization', 'warning'); return; }

    const session = getActiveSession();
    const model   = session?.model || STATE.settings.model || 'claude-3-5-haiku-20241022';
    const modelDef = MODELS_DATA?.getModel(model);
    const provider = modelDef?.provider || 'anthropic';

    const improvePrompt =
      `Rewrite this prompt to be more specific, clear, and effective for an AI assistant. ` +
      `Return ONLY the improved prompt, nothing else.\n\nOriginal prompt: ${originalPrompt}`;

    const apiKey = STATE.apiKeys[provider] || STATE.apiKeys.anthropic || '';
    if (!apiKey) { toast('✨ No key for this provider — try adding one in Settings', 'warning'); return; }

    let improved = '';
    const gen = ApiRouter.stream(
      provider,
      model,
      apiKey,
      [{ role: 'user', content: improvePrompt }],
      '',
      { maxTokens: 300 }
    );
    for await (const chunk of gen) {
      if (chunk.delta) improved += chunk.delta;
    }
    if (improved) {
      input.value = improved.trim();
      autoResize(input);
      toast('✨ Prompt improved!', 'success', 2000);
    }
  } catch (err) {
    toast('✨ Could not improve prompt — ' + (err.message || 'try again'), 'warning');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨'; }
  }
}

// ============================================================
// Follow-up Suggestions (shown after each AI response)
// ============================================================
const FOLLOWUP_KEY = 'async_followups';

function renderFollowupSuggestions(session) {
  // Remove any existing suggestions bar
  document.getElementById('followup-bar')?.remove();

  const lastAssistant = [...(session?.messages || [])].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant || !lastAssistant.content) return;

  // Heuristic: generate 3 contextual suggestions based on last assistant message topic
  const text = (typeof lastAssistant.content === 'string' ? lastAssistant.content : '').slice(0, 600);
  const suggestions = generateFollowupHints(text);
  if (!suggestions.length) return;

  const bar = document.createElement('div');
  bar.id = 'followup-bar';
  bar.className = 'followup-bar';
  bar.innerHTML = `
    <span class="followup-label">Try asking:</span>
    ${suggestions.map(s => `
      <button class="followup-chip" onclick="injectFollowup(${JSON.stringify(s)})">${s}</button>
    `).join('')}
    <button class="followup-dismiss" id="followup-dismiss" aria-label="Dismiss suggestions">✕</button>
  `;

  bar.querySelector('#followup-dismiss')?.addEventListener('click', () => bar.remove());

  const composerInner = document.querySelector('.composer-inner');
  if (composerInner) composerInner.insertBefore(bar, composerInner.firstChild);
}

function generateFollowupHints(text) {
  const lower = text.toLowerCase();
  // Pattern-match to generate contextual follow-ups
  const hints = [];

  if (lower.includes('code') || lower.includes('function') || lower.includes('class') || lower.includes('```')) {
    hints.push('Can you explain this step by step?', 'Add error handling to this', 'Write tests for this');
  } else if (lower.includes('list') || lower.match(/\d\.\s/)) {
    hints.push('Tell me more about item 1', 'Which is most important?', 'Summarise in one sentence');
  } else if (lower.includes('?') || lower.includes('question')) {
    hints.push('Can you give an example?', 'What are the alternatives?', 'Go deeper on this');
  } else if (lower.length > 200) {
    hints.push('Summarise that briefly', 'What should I do first?', 'Any downsides?');
  } else {
    hints.push('Tell me more', 'What about edge cases?', 'Can you simplify this?');
  }

  return hints.slice(0, 3);
}

function injectFollowup(text) {
  document.getElementById('followup-bar')?.remove();
  const input = document.getElementById('message-input');
  if (!input) return;
  input.value = text;
  autoResize(input);
  input.focus();
}


// localStorage keys holding this app's own state/data. Auth (cpu_auth_*) and
// the encrypted key vault (cpu_apikeys_v2) are intentionally excluded so a
// reset recovers from corrupt app state without logging the user out or
// destroying their stored keys.
const RESETTABLE_KEYS = [
  STORAGE_KEY, LEGACY_KEY,
  'claude_power_ui_v2', 'claude_power_ui_v1',
  ONBOARDING_KEY, FOLLOWUP_KEY,
];

function resetLocalData() {
  try {
    RESETTABLE_KEYS.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Reset local data failed:', e);
  }
  location.reload();
}

function renderBootError(err) {
  console.error('Boot failed:', err);
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;background:#030712;color:#e2e8f0;font-family:system-ui,sans-serif;
                padding:40px;text-align:center;gap:20px">
      <div style="font-size:48px">⚠️</div>
      <h1 style="font-size:24px;font-weight:700;margin:0;color:#f8fafc">Something went wrong</h1>
      <p style="max-width:480px;color:#94a3b8;line-height:1.6;margin:0">
        Async couldn't finish loading. This is usually caused by corrupted local data.
        You can reset this app's local data (your account and saved API keys are kept) and try again.
      </p>
      <pre style="max-width:520px;width:100%;overflow:auto;background:#0f172a;border:1px solid #1e293b;
                  border-radius:8px;padding:14px;font-size:12px;color:#f87171;text-align:left;margin:0">${esc(String(err?.stack || err?.message || err))}</pre>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        <button id="boot-error-reload" style="padding:12px 28px;background:#1e293b;color:#e2e8f0;
                border:1px solid #334155;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer">
          Reload
        </button>
        <button id="boot-error-reset" style="padding:12px 28px;background:#6366f1;color:#fff;
                border:none;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer">
          Reset local data
        </button>
      </div>
    </div>`;
  app.querySelector('#boot-error-reload')?.addEventListener('click', () => location.reload());
  app.querySelector('#boot-error-reset')?.addEventListener('click', resetLocalData);
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(renderBootError);
});

// Global safety nets — surface unexpected failures to the user instead of
// failing silently. These do NOT auto-reset; they only inform.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  console.error('Unhandled promise rejection:', reason);
  toast('Unexpected error: ' + (reason?.message || String(reason)), 'error', 6000);
});

window.onerror = function (message, source, lineno, colno, error) {
  console.error('Uncaught error:', error || message, source, lineno, colno);
  toast('Unexpected error: ' + (error?.message || message), 'error', 6000);
  return false;
};

// ============================================================
// Cost Breakdown Popover
// ============================================================
function toggleCostBreakdown() {
  const existing = document.getElementById('cost-breakdown-popover');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('cost-widget-btn');
  if (!btn) return;

  // Build per-session cost table for today
  const today = new Date().toDateString();
  const sessionsToday = STATE.sessions
    .filter(s => s.totalCost > 0 && new Date(s.updatedAt).toDateString() === today)
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 15);

  const allTimeCost = STATE.sessions.reduce((t, s) => t + (s.totalCost || 0), 0);
  const dailyCost   = STATE.costs.dailyTotal || 0;

  const pop = document.createElement('div');
  pop.id = 'cost-breakdown-popover';
  pop.className = 'cost-breakdown-pop';
  pop.innerHTML = `
    <div class="cost-breakdown-header">
      <span>💰 Cost Breakdown</span>
      <button onclick="document.getElementById('cost-breakdown-popover')?.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px">✕</button>
    </div>
    <div class="cost-breakdown-stats">
      <div class="cost-stat">
        <div class="cost-stat-label">Today</div>
        <div class="cost-stat-val">${formatCost(dailyCost) || '$0.00'}</div>
      </div>
      <div class="cost-stat">
        <div class="cost-stat-label">All Time</div>
        <div class="cost-stat-val">${formatCost(allTimeCost) || '$0.00'}</div>
      </div>
      <div class="cost-stat">
        <div class="cost-stat-label">Sessions</div>
        <div class="cost-stat-val">${STATE.sessions.length}</div>
      </div>
    </div>
    ${sessionsToday.length ? `
      <div class="cost-breakdown-label">Today's sessions</div>
      <div class="cost-breakdown-list">
        ${sessionsToday.map(s => `
          <div class="cost-breakdown-row">
            <span class="cost-row-title">${esc(s.title.slice(0, 36))}${s.title.length > 36 ? '…' : ''}</span>
            <span class="cost-row-val">${formatCost(s.totalCost)}</span>
          </div>
        `).join('')}
      </div>
    ` : `<div style="padding:12px 0;text-align:center;font-size:12px;color:var(--text-muted)">No spending today</div>`}
    <button class="cost-breakdown-reset" onclick="if(confirm('Reset all cost tracking?')){STATE.costs={dailyTotal:0,sessions:{}};saveState();updateCostDisplays();document.getElementById('cost-breakdown-popover')?.remove();toast('Cost tracking reset','success')}">Reset tracking</button>
  `;

  // Position above the button
  const rect = btn.getBoundingClientRect();
  pop.style.cssText = `position:fixed;bottom:${window.innerHeight - rect.top + 8}px;left:${rect.left}px;z-index:9999`;

  document.body.appendChild(pop);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closer(e) {
      if (!pop.contains(e.target) && e.target !== btn) {
        pop.remove();
        document.removeEventListener('click', closer);
      }
    });
  }, 50);
}

// ============================================================
// Session Sharing (read-only snapshot link)
// ============================================================
function shareSession() {
  const session = getActiveSession();
  if (!session?.messages.length) {
    toast('No messages to share', 'info');
    return;
  }

  // Build a compact snapshot object
  const snapshot = {
    v:    1,
    t:    session.title,
    m:    session.model,
    at:   session.updatedAt,
    msgs: session.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        r: m.role === 'user' ? 'u' : 'a',
        c: typeof m.content === 'string' ? m.content.slice(0, 4000) : '',
        ...(m.cost ? { $: m.cost } : {}),
      })),
  };

  let encoded;
  try {
    const json    = JSON.stringify(snapshot);
    const bytes   = new TextEncoder().encode(json);
    const b64     = btoa(String.fromCharCode(...bytes));
    encoded = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch (e) {
    toast('Snapshot too large to share as URL — use Export instead', 'warning', 5000);
    return;
  }

  // Build the share URL pointing to our read-only viewer
  const shareUrl = `${window.location.origin}/app/share.html#${encoded}`;

  // Copy to clipboard and show modal
  navigator.clipboard.writeText(shareUrl).then(() => {
    showShareModal(shareUrl, session.title);
  }).catch(() => {
    showShareModal(shareUrl, session.title);
  });
}

function showShareModal(url, title) {
  const existing = document.getElementById('share-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'share-modal-overlay';
  overlay.className = 'share-modal-overlay';
  overlay.innerHTML = `
    <div class="share-modal-card" role="dialog" aria-label="Share conversation">
      <button class="share-modal-close" id="share-modal-close" aria-label="Close">✕</button>
      <div class="share-modal-icon">🔗</div>
      <h3 class="share-modal-title">Share Conversation</h3>
      <p class="share-modal-subtitle">${esc(title.slice(0,60))}</p>
      <div class="share-url-box">
        <input class="share-url-input" id="share-url-input" type="text" value="${esc(url)}" readonly />
        <button class="share-copy-btn" id="share-copy-btn" title="Copy link">📋</button>
      </div>
      <p class="share-modal-note">
        Anyone with this link can view the conversation in read-only mode.<br>
        The snapshot is encoded in the URL — no server required.
      </p>
      <div class="share-modal-actions">
        <button class="share-open-btn" onclick="window.open('${esc(url)}','_blank')">Open Preview ↗</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#share-modal-close')?.addEventListener('click', () => overlay.remove());

  const copyBtn = overlay.querySelector('#share-copy-btn');
  copyBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      copyBtn.textContent = '✅';
      setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
      toast('Link copied!', 'success', 2000);
    });
  });

  // Select the URL on click
  overlay.querySelector('#share-url-input')?.addEventListener('click', e => e.target.select());

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('share-in'));
  toast('Share link copied to clipboard!', 'success', 3000);
}

// ============================================================
// Image-to-Image file upload wiring
// (called from attachEventListeners via _wireImg2ImgUpload)
// ============================================================
window._wireImg2ImgUpload = function() {
  const dropzone = document.getElementById('img2img-dropzone');
  const fileInput = document.getElementById('img2img-file');
  const label    = document.getElementById('img2img-dropzone-label');
  const urlInput = document.getElementById('imagine-image-url');
  if (!dropzone || !fileInput) return;

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Please select an image file', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      // Store as data URL in the URL field — proxy will handle it
      if (urlInput) urlInput.value = dataUrl;
      if (label) {
        label.innerHTML = `<span style="color:var(--text-primary)">✅ ${esc(file.name)} (${(file.size/1024).toFixed(0)} KB)</span>`;
      }
      dropzone.classList.add('img2img-loaded');
    };
    reader.readAsDataURL(file);
  }

  // Click to open file picker
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  // Drag and drop
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('img2img-drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('img2img-drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('img2img-drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  // Clear when popover closes / provider changes
  document.addEventListener('click', e => {
    if (e.target?.closest?.('#image-popover')) return;
    // Reset on close
    if (label) label.textContent = '🖼️ Drop image or click to upload';
    if (urlInput) urlInput.value = '';
    dropzone.classList.remove('img2img-loaded');
  });
};

// ── Image Remix & Randomize ─────────────────────────────────────
window.remixImagePrompt = function(originalPrompt) {
  // Strip "/imagine " if it exists
  let base = originalPrompt.replace(/^\/imagine\s+/i, '').trim();
  
  // Strip common parameter flags (e.g., --ar 16:9, --seed 123)
  base = base.replace(/--\w+\s+[^\s]+/g, '').replace(/--\w+/g, '').replace(/,/g, '').trim();

  // Expanded list of rich, highly attractive styles
  const styles = [
    "cinematic lighting, Unreal Engine 5 render, epic composition, masterpiece, 8k resolution, photorealistic",
    "neon cyberpunk style, glowing neon lights, high contrast, bustling futuristic city aesthetic, hyper-detailed",
    "dreamy watercolor painting, ethereal, pastel colors, soft edges, studio ghibli inspired, magical",
    "vintage 35mm film photography, Kodak Portra 400, beautiful grain, light leaks, nostalgic and moody",
    "hyper-realistic macro photography, incredibly detailed, 85mm lens, f/1.8, shallow depth of field, sharp focus",
    "retro pop-art style, vibrant contrasting colors, comic book halftone patterns, bold outlines",
    "dark fantasy, gothic, moody atmospheric lighting, masterpiece, intricate details, trending on ArtStation",
    "anime illustration style, lush landscapes, vibrant colors, expressive details, Makoto Shinkai aesthetic, 4K",
    "oil painting by old masters, chiaroscuro lighting, rich textures, museum quality, classic composition",
    "isometric 3D render, claymation style, cute and colorful, clean background, soft studio lighting",
    "synthwave aesthetic, retro-futuristic, neon grid, 1980s outrun style, vivid magenta and cyan, VHS effect",
    "bioluminescent glowing details, ethereal alien flora, deep sea vibes, magical lighting, fantasy concept art",
    "award-winning National Geographic wildlife photography, dramatic natural lighting, breathtaking details",
    "minimalist vector art, flat colors, clean geometric shapes, modern corporate illustration, sharp edges",
    "steampunk aesthetic, brass and copper gears, Victorian architecture, sepia tones, intricate mechanical details"
  ];
  
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  const newPrompt = `${base}, ${randomStyle}`;
  
  // Open the image gen modal if it's not already open
  const pop = document.getElementById('image-popover');
  if (pop && pop.style.display === 'none') {
    if (typeof window.toggleImagePopover === 'function') {
      window.toggleImagePopover();
    } else {
      pop.style.display = 'block';
    }
  }

  // Populate the field in the modal
  const popPrompt = document.getElementById('imagine-prompt');
  if (popPrompt) {
    popPrompt.value = newPrompt;
    popPrompt.focus();
  }
};

window.setAgentBackground = function(url) {
  if (!url) return;
  try {
    const raw = localStorage.getItem('async_ai_v2') || '{}';
    const state = JSON.parse(raw);
    if (!state.settings) state.settings = {};
    state.settings.agentBackground = url;
    localStorage.setItem('async_ai_v2', JSON.stringify(state));
    
    // Also save to firebase if we have it open in app.js
    if (window.db && window.AuthSystem) {
       const session = AuthSystem.getCurrentSession();
       const ref = (session && session.userId) ? cpuStateDocRef(session) : null;
       if (ref) ref.set({ settings: state.settings }, { merge: true });
    }
    toast('Agent background set! Open Aria to see it.', 'success');
  } catch(e) {
    toast('Error setting background: ' + e.message, 'error');
  }
};

window.ServerSync = ServerSync;

window.copyCodeBlock = copyCodeBlock;
window.injectSkillFromSuggestion = injectSkillFromSuggestion;
window.dismissSkillSuggestions = dismissSkillSuggestions;
window.clearInjectedSkill = clearInjectedSkill;
window.closeMemoryPanel = closeMemoryPanel;
window.handleMemoryAdd = handleMemoryAdd;
window.handleAutoExtract = handleAutoExtract;
window.saveWorkspacePrompt = saveWorkspacePrompt;
window.handleMemoryDelete = handleMemoryDelete;
window.handleWorkspaceChange = handleWorkspaceChange;
window.handleNewWorkspace = handleNewWorkspace;
window.toggleDomain = toggleDomain;
window.injectSkill = injectSkill;
window.removeAttachment = removeAttachment;
window.toggleImagePopover = toggleImagePopover;
window.updateImagineModels = updateImagineModels;
window.syncImagineModeFields = syncImagineModeFields;
window.generateFromPopover = generateFromPopover;
window.doLogout = doLogout;
window.injectFollowup = injectFollowup;
