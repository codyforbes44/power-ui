/* ============================================================
   CLAUDE POWER UI v2 — Analytics Event Tracking
   Ring buffer · Aggregators · Per-session metrics
   ============================================================ */

const Analytics = (() => {

  const STORE_KEY  = 'cpu_analytics';
  const MAX_EVENTS = 10000;

  // ──────────────────────────────────────────────────────────
  // Storage
  // ──────────────────────────────────────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { events: [], meta: {} }; }
    catch { return { events: [], meta: {} }; }
  }

  function save(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  // ──────────────────────────────────────────────────────────
  // Core: track an event
  // ──────────────────────────────────────────────────────────
  function track(eventType, data = {}) {
    try {
      const store = load();
      const session = typeof AuthSystem !== 'undefined' ? AuthSystem.getCurrentSession() : null;

      const event = {
        id:        Math.random().toString(36).slice(2,9),
        type:      eventType,
        userId:    session?.userId  || 'anon',
        username:  session?.username || 'anon',
        ts:        Date.now(),
        date:      new Date().toISOString().slice(0, 10), // YYYY-MM-DD
        hour:      new Date().getHours(),
        ...data,
      };

      store.events.push(event);

      // Ring buffer: keep last MAX_EVENTS
      if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(-MAX_EVENTS);
      }

      save(store);
    } catch(e) {
      // Never crash the app for analytics
      console.warn('Analytics.track error:', e);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Aggregation helpers
  // ──────────────────────────────────────────────────────────

  function getAllEvents() { return load().events; }

  function getEventsByType(type) {
    return getAllEvents().filter(e => e.type === type);
  }

  function getEventsInRange(days = 30) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return getAllEvents().filter(e => e.ts >= cutoff);
  }

  /** Daily message + cost bucketed by date (last N days) */
  function getUsageByDay(days = 30) {
    const events = getEventsInRange(days).filter(e => e.type === 'message_sent');
    const map = {};
    // Pre-fill all days
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      map[d] = { date: d, messages: 0, cost: 0, tokens: 0 };
    }
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = { date: e.date, messages: 0, cost: 0, tokens: 0 };
      map[e.date].messages++;
      map[e.date].cost    += (e.cost    || 0);
      map[e.date].tokens  += (e.inputTokens || 0) + (e.outputTokens || 0);
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Hourly usage distribution (0–23) */
  function getUsageByHour() {
    const events = getEventsByType('message_sent');
    const hours  = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    events.forEach(e => { if (e.hour >= 0 && e.hour < 24) hours[e.hour].count++; });
    return hours;
  }

  /** Model usage breakdown */
  function getModelBreakdown() {
    const events  = getEventsByType('message_sent');
    const map = {};
    events.forEach(e => {
      const m = e.model || 'unknown';
      if (!map[m]) map[m] = { model: m, provider: e.provider || '?', count: 0, cost: 0 };
      map[m].count++;
      map[m].cost += (e.cost || 0);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }

  /** Provider breakdown */
  function getProviderBreakdown() {
    const events = getEventsByType('message_sent');
    const map = {};
    events.forEach(e => {
      const p = e.provider || 'unknown';
      if (!map[p]) map[p] = { provider: p, count: 0, cost: 0 };
      map[p].count++;
      map[p].cost += (e.cost || 0);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }

  /** Top skills by injection count */
  function getTopSkills(topN = 10) {
    const events = getEventsByType('skill_injected');
    const map = {};
    events.forEach(e => {
      const s = e.skillName || e.skillSlug || 'unknown';
      if (!map[s]) map[s] = { skill: s, count: 0 };
      map[s].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, topN);
  }

  /** Per-user message + cost stats */
  function getUserStats() {
    const events = getEventsByType('message_sent');
    const map = {};
    events.forEach(e => {
      const u = e.username || 'anon';
      if (!map[u]) map[u] = { username: u, userId: e.userId, messages: 0, cost: 0, tokens: 0 };
      map[u].messages++;
      map[u].cost   += (e.cost || 0);
      map[u].tokens += (e.inputTokens || 0) + (e.outputTokens || 0);
    });
    return Object.values(map).sort((a, b) => b.messages - a.messages);
  }

  /** 7-day rolling average cost */
  function getCostTrend(days = 30) {
    const daily = getUsageByDay(days);
    const WINDOW = 7;
    return daily.map((d, i) => {
      const slice = daily.slice(Math.max(0, i - WINDOW + 1), i + 1);
      const avg   = slice.reduce((s, x) => s + x.cost, 0) / slice.length;
      return { ...d, rollingAvg: avg };
    });
  }

  /** Summary KPIs for overview cards */
  function getSummary() {
    const all    = getAllEvents();
    const msgs   = all.filter(e => e.type === 'message_sent');
    const today  = new Date().toISOString().slice(0, 10);
    const todayMsgs  = msgs.filter(e => e.date === today);

    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthMsgs = msgs.filter(e => e.date?.startsWith(thisMonth));

    return {
      totalMessages:    msgs.length,
      todayMessages:    todayMsgs.length,
      totalCost:        msgs.reduce((s, e) => s + (e.cost || 0), 0),
      monthCost:        monthMsgs.reduce((s, e) => s + (e.cost || 0), 0),
      totalTokens:      msgs.reduce((s, e) => s + (e.inputTokens || 0) + (e.outputTokens || 0), 0),
      skillsInjected:   all.filter(e => e.type === 'skill_injected').length,
      filesAttached:    all.filter(e => e.type === 'file_attached').length,
      artifactPreviews: all.filter(e => e.type === 'artifact_previewed').length,
      sessionsCreated:  all.filter(e => e.type === 'session_created').length,
      memoriesAdded:    all.filter(e => e.type === 'memory_added').length,
      totalEvents:      all.length,
    };
  }

  /** Storage usage estimate */
  function getStorageInfo() {
    let used = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        used += (localStorage[key].length + key.length) * 2; // UTF-16 bytes
      }
    }
    const quota = 10 * 1024 * 1024; // 10 MB typical quota
    return {
      usedBytes:  used,
      usedKB:     (used / 1024).toFixed(1),
      usedMB:     (used / 1048576).toFixed(2),
      quotaMB:    (quota / 1048576).toFixed(0),
      pct:        Math.min(100, (used / quota * 100)).toFixed(1),
    };
  }

  /** Clear all analytics data */
  function clearAll() {
    localStorage.removeItem(STORE_KEY);
  }

  /** Export analytics as JSON */
  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────
  return {
    track,
    getAllEvents,
    getEventsByType,
    getEventsInRange,
    getUsageByDay,
    getUsageByHour,
    getModelBreakdown,
    getProviderBreakdown,
    getTopSkills,
    getUserStats,
    getCostTrend,
    getSummary,
    getStorageInfo,
    clearAll,
    exportJSON,
  };

})();
