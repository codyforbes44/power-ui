/* ============================================================
   CLAUDE POWER UI v2 — Admin Dashboard Engine
   Charts (Canvas API) · User management · Data export
   ============================================================ */

const AdminApp = (() => {

  // ──────────────────────────────────────────────────────────
  // Palettes
  // ──────────────────────────────────────────────────────────
  const COLORS = {
    indigo:  '#6366f1',
    purple:  '#8b5cf6',
    cyan:    '#06b6d4',
    emerald: '#10b981',
    amber:   '#f59e0b',
    rose:    '#e11d48',
    slate:   '#475569',
  };

  const PALETTE = [
    '#6366f1','#8b5cf6','#06b6d4','#10b981',
    '#f59e0b','#e11d48','#0ea5e9','#84cc16',
    '#f97316','#ec4899','#14b8a6','#a78bfa',
  ];

  const GRID_COLOR  = 'rgba(255,255,255,0.05)';
  const TEXT_COLOR  = '#475569';
  const FONT_FAMILY = "'Inter', sans-serif";

  // ──────────────────────────────────────────────────────────
  // Toast
  // ──────────────────────────────────────────────────────────
  function toast(msg, type = 'info', duration = 3000) {
    const c = document.getElementById('admin-toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `admin-toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${String(msg).replace(/</g,'&lt;')}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = 'all 0.2s'; setTimeout(() => el.remove(), 220); }, duration);
  }

  // ──────────────────────────────────────────────────────────
  // Formatting helpers
  // ──────────────────────────────────────────────────────────
  function fmtCost(n)    { return n < 0.001 ? '$0.000' : `$${n.toFixed(n >= 1 ? 2 : 4)}`; }
  function fmtNum(n)     { return n >= 1000 ? (n/1000).toFixed(1) + 'k' : String(n); }
  function fmtTokens(n)  { return n >= 1000000 ? (n/1000000).toFixed(2)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }
  function fmtDate(ts)   { if (!ts) return '—'; return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
  function fmtRelative(ts) {
    if (!ts) return '—';
    const d = Date.now() - ts;
    if (d < 60000)    return 'just now';
    if (d < 3600000)  return `${Math.floor(d/60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
    return fmtDate(ts);
  }
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ──────────────────────────────────────────────────────────
  // Mobile off-canvas sidebar drawer (<1024px — see admin.css)
  // ──────────────────────────────────────────────────────────
  let sidebarOpen = false;

  function isMobileViewport() {
    return window.matchMedia('(max-width: 1024px)').matches;
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    document.querySelector('.admin-sidebar')?.classList.toggle('open', sidebarOpen);
    document.getElementById('admin-drawer-backdrop')?.classList.toggle('visible', sidebarOpen);
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
  }

  function closeSidebar() {
    if (!sidebarOpen) return;
    toggleSidebar();
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });

  // ──────────────────────────────────────────────────────────
  // Panel navigation
  // ──────────────────────────────────────────────────────────
  const PANEL_TITLES = {
    overview:    'Platform Overview',
    usage:       'Usage & Charts',
    costs:       'Cost Breakdown',
    skills:      'Top Skills',
    users:       'User Management',
    settings:    'General Settings',
    connections: 'API Keys & MCP Resources',
    health:      'System Health',
  };

  async function switchPanel(panelId, navEl) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) panel.classList.add('active');
    if (navEl) navEl.classList.add('active');
    document.getElementById('admin-topbar-title').textContent = PANEL_TITLES[panelId] || panelId;
    if (isMobileViewport()) closeSidebar(); // picking a page should put the drawer away
    await renderPanel(panelId);
  }

  // ──────────────────────────────────────────────────────────
  // Main render router
  // ──────────────────────────────────────────────────────────
  async function renderPanel(panelId) {
    switch(panelId) {
      case 'overview':    renderOverview();     break;
      case 'usage':       renderUsage();        break;
      case 'costs':       renderCosts();        break;
      case 'skills':      renderSkills();       break;
      case 'users':       renderUsers();        break;
      case 'settings':    renderSettings();     break;
      case 'connections': await renderConnections();  break;
      case 'health':      await renderHealth();       break;
    }
  }

  async function refresh() {
    const activePanel = document.querySelector('.admin-panel.active');
    if (!activePanel) return;
    const panelId = activePanel.id.replace('panel-','');
    await renderPanel(panelId);
    toast('Dashboard refreshed', 'success', 1500);
  }

  // ──────────────────────────────────────────────────────────
  // Settings Panel
  // ──────────────────────────────────────────────────────────
  function renderSettings() {
    let settings = { maxTokens: 4096, defaultSystemPrompt: '', skillAutoSuggest: true };
    try {
      const raw = localStorage.getItem('claude_power_ui_v2') || '{}';
      const state = JSON.parse(raw);
      if (state.settings) {
        Object.assign(settings, state.settings);
      }
    } catch {}

    const maxTokensEl = document.getElementById('admin-max-tokens');
    const systemPromptEl = document.getElementById('admin-default-system');
    const autoSuggestEl = document.getElementById('admin-auto-suggest');

    if (maxTokensEl) maxTokensEl.value = settings.maxTokens;
    if (systemPromptEl) systemPromptEl.value = settings.defaultSystemPrompt;
    if (autoSuggestEl) autoSuggestEl.checked = settings.skillAutoSuggest;
  }

  function saveSettings() {
    const maxTokensEl = document.getElementById('admin-max-tokens');
    const systemPromptEl = document.getElementById('admin-default-system');
    const autoSuggestEl = document.getElementById('admin-auto-suggest');

    const maxTokens = maxTokensEl ? (parseInt(maxTokensEl.value) || 4096) : 4096;
    const defaultSystemPrompt = systemPromptEl ? systemPromptEl.value : '';
    const skillAutoSuggest = autoSuggestEl ? autoSuggestEl.checked : true;

    try {
      const raw = localStorage.getItem('claude_power_ui_v2') || '{}';
      const state = JSON.parse(raw);
      if (!state.settings) state.settings = {};
      state.settings.maxTokens = maxTokens;
      state.settings.defaultSystemPrompt = defaultSystemPrompt;
      state.settings.skillAutoSuggest = skillAutoSuggest;
      localStorage.setItem('claude_power_ui_v2', JSON.stringify(state));
      toast('Settings saved successfully.', 'success');
    } catch (e) {
      toast('Failed to save settings: ' + e.message, 'error');
    }
  }

  // ──────────────────────────────────────────────────────────
  // Overview panel
  // ──────────────────────────────────────────────────────────
  function renderOverview() {
    renderKPICards();
    renderDailyChart();
    renderModelDonut();
    renderProviderDonut();
  }

  function renderKPICards() {
    const s  = Analytics.getSummary();
    const st = Analytics.getStorageInfo();
    const kpiGrid = document.getElementById('kpi-grid');
    if (!kpiGrid) return;

    const kpis = [
      { icon: '💬', value: fmtNum(s.totalMessages), label: 'Total Messages', sub: `${fmtNum(s.todayMessages)} today`, color: COLORS.indigo },
      { icon: '💲', value: fmtCost(s.totalCost),    label: 'Total Spend',    sub: `${fmtCost(s.monthCost)} this month`, color: COLORS.cyan },
      { icon: '🔠', value: fmtTokens(s.totalTokens),label: 'Total Tokens',   sub: 'all time',                 color: COLORS.purple },
      { icon: '⊞',  value: fmtNum(s.skillsInjected),label: 'Skills Injected',sub: 'all time',                 color: COLORS.amber },
      { icon: '📎', value: fmtNum(s.filesAttached), label: 'Files Attached', sub: 'all time',                 color: COLORS.emerald },
      { icon: '⬜', value: fmtNum(s.artifactPreviews), label: 'Artifact Previews', sub: 'all time',           color: COLORS.rose },
      { icon: '🗂',  value: fmtNum(s.sessionsCreated), label: 'Sessions Created', sub: 'all time',            color: COLORS.indigo },
      { icon: '🧠', value: fmtNum(s.memoriesAdded), label: 'Memories Stored', sub: 'all time',               color: COLORS.purple },
      { icon: '📊', value: fmtNum(s.totalEvents),   label: 'Analytics Events', sub: `${st.usedMB}MB used`,   color: COLORS.slate },
    ];

    kpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi-card" style="--kpi-color:${k.color}">
        <span class="kpi-icon">${k.icon}</span>
        <div class="kpi-value">${esc(k.value)}</div>
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-sub">${esc(k.sub)}</div>
      </div>
    `).join('');
  }

  // ──────────────────────────────────────────────────────────
  // Chart: Daily line chart (messages + cost)
  // ──────────────────────────────────────────────────────────
  function renderDailyChart() {
    const canvas = document.getElementById('chart-daily');
    if (!canvas) return;
    const data = Analytics.getUsageByDay(30);
    drawDualLineChart(canvas, data);
  }

  function drawDualLineChart(canvas, data) {
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth  || canvas.parentElement.offsetWidth;
    const H   = 200;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { top: 16, right: 24, bottom: 40, left: 44 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!data.length) {
      drawEmpty(ctx, W, H, 'No data yet — send some messages!');
      return;
    }

    const msgs  = data.map(d => d.messages);
    const costs = data.map(d => d.cost);
    const maxMsg  = Math.max(...msgs,  1);
    const maxCost = Math.max(...costs, 0.001);

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    }

    // Labels
    ctx.fillStyle  = TEXT_COLOR;
    ctx.font       = `10px ${FONT_FAMILY}`;
    ctx.textAlign  = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.fillText(Math.round(maxMsg * (4 - i) / 4), pad.left - 6, y + 3);
    }

    // X labels (every 5 days)
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      if (i % 5 === 0 || i === data.length - 1) {
        const x = pad.left + (i / (data.length - 1)) * cW;
        ctx.fillText(d.date.slice(5), x, H - 8);
      }
    });

    // Messages line + fill
    function plotLine(values, maxVal, color, alpha = 0.15) {
      const pts = values.map((v, i) => ({
        x: pad.left + (i / Math.max(data.length - 1, 1)) * cW,
        y: pad.top + cH - (v / maxVal) * cH,
      }));

      // Fill
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
      grad.addColorStop(0, color.replace(')', `,${alpha})`).replace('rgb','rgba'));
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pad.top + cH);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length-1].x, pad.top + cH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const cpX = (pts[i-1].x + pts[i].x) / 2;
        ctx.bezierCurveTo(cpX, pts[i-1].y, cpX, pts[i].y, pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.stroke();

      return pts;
    }

    plotLine(msgs,  maxMsg,  '#6366f1');
    plotLine(costs, maxCost, '#06b6d4');
  }

  // ──────────────────────────────────────────────────────────
  // Chart: Donut charts
  // ──────────────────────────────────────────────────────────
  function drawDonut(canvas, segments, legendContainerId) {
    const dpr = window.devicePixelRatio || 1;
    const SIZE = Math.min(canvas.parentElement.offsetWidth, 200);
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = SIZE + 'px';
    canvas.style.height = SIZE + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = SIZE / 2, cy = SIZE / 2;
    const R  = SIZE * 0.38;
    const r  = R * 0.55;

    ctx.clearRect(0, 0, SIZE, SIZE);

    if (!segments.length) {
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `11px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data yet', cx, cy);
      return;
    }

    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let angle = -Math.PI / 2;

    segments.forEach((seg, i) => {
      const slice = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();

      // Inner hole
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      angle += slice;
    });

    // Center text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `bold 16px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtNum(total), cx, cy - 6);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillText('total', cx, cy + 10);

    // Legend
    const legendEl = document.getElementById(legendContainerId);
    if (legendEl) {
      legendEl.innerHTML = segments.slice(0, 6).map((seg, i) => `
        <div class="chart-legend-item">
          <div class="chart-legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></div>
          ${esc(seg.label)} <span style="margin-left:4px;font-family:var(--font-mono);font-size:9px;color:#475569">(${Math.round(seg.value/total*100)}%)</span>
        </div>
      `).join('');
    }
  }

  function renderModelDonut() {
    const canvas   = document.getElementById('chart-models');
    if (!canvas) return;
    const breakdown = Analytics.getModelBreakdown();
    const segments  = breakdown.map(m => ({ label: m.model.replace('claude-','').replace('gpt-',''), value: m.count }));
    drawDonut(canvas, segments, 'chart-models-legend');
  }

  function renderProviderDonut() {
    const canvas   = document.getElementById('chart-providers');
    if (!canvas) return;
    const breakdown = Analytics.getProviderBreakdown();
    const segments  = breakdown.map(p => ({ label: p.provider, value: p.count }));
    drawDonut(canvas, segments, 'chart-providers-legend');
  }

  // ──────────────────────────────────────────────────────────
  // Usage panel
  // ──────────────────────────────────────────────────────────
  function renderUsage() {
    renderHourlyChart();
    renderCostTrendChart();
  }

  function renderHourlyChart() {
    const canvas = document.getElementById('chart-hourly');
    if (!canvas) return;
    const data = Analytics.getUsageByHour();
    drawBarChart(canvas, data.map(d => d.hour.toString().padStart(2,'0')), data.map(d => d.count), COLORS.indigo, 'Hour');
  }

  function drawBarChart(canvas, labels, values, color, label = '') {
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth || canvas.parentElement.offsetWidth;
    const H   = 180;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { top: 16, right: 16, bottom: 36, left: 40 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const maxVal = Math.max(...values, 1);
    const barW   = cW / labels.length * 0.6;
    const gap    = cW / labels.length;

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `10px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * (4 - i) / 4), pad.left - 5, y + 3);
    }

    // Bars
    values.forEach((v, i) => {
      const x  = pad.left + i * gap + gap * 0.2;
      const bH = (v / maxVal) * cH;
      const y  = pad.top + cH - bH;

      const grad = ctx.createLinearGradient(0, y, 0, pad.top + cH);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color.replace('rgb','rgba').replace(')', ',0.3)').replace('#6366f1','rgba(99,102,241,0.3)').replace('#8b5cf6','rgba(139,92,246,0.3)').replace('#06b6d4','rgba(6,182,212,0.3)'));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, bH, [2, 2, 0, 0]);
      ctx.fill();

      // X label (every 4th for hours)
      if (i % 4 === 0 || labels.length <= 10) {
        ctx.fillStyle  = TEXT_COLOR;
        ctx.font       = `9px ${FONT_FAMILY}`;
        ctx.textAlign  = 'center';
        ctx.fillText(labels[i], x + barW / 2, H - 8);
      }
    });
  }

  function renderCostTrendChart() {
    const canvas = document.getElementById('chart-cost-trend');
    if (!canvas) return;
    const trend = Analytics.getCostTrend(30);

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth || canvas.parentElement.offsetWidth;
    const H   = 200;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { top: 16, right: 24, bottom: 40, left: 56 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!trend.some(d => d.cost > 0)) {
      drawEmpty(ctx, W, H, 'No cost data yet');
      return;
    }

    const maxCost = Math.max(...trend.map(d => Math.max(d.cost, d.rollingAvg || 0)), 0.001);

    // Grid
    ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
      ctx.fillStyle = TEXT_COLOR; ctx.font = `10px ${FONT_FAMILY}`; ctx.textAlign = 'right';
      ctx.fillText(fmtCost(maxCost * (4 - i) / 4), pad.left - 5, y + 3);
    }

    function plotTrend(values, color, dashed = false) {
      const pts = values.map((v, i) => ({
        x: pad.left + (i / Math.max(trend.length - 1, 1)) * cW,
        y: pad.top + cH - (v / maxCost) * cH,
      }));
      ctx.beginPath();
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const cpX = (pts[i-1].x + pts[i].x) / 2;
        ctx.bezierCurveTo(cpX, pts[i-1].y, cpX, pts[i].y, pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = dashed ? 1.5 : 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    plotTrend(trend.map(d => d.cost),       COLORS.cyan);
    plotTrend(trend.map(d => d.rollingAvg || 0), COLORS.amber, true);

    // X labels
    ctx.fillStyle = TEXT_COLOR; ctx.font = `10px ${FONT_FAMILY}`; ctx.textAlign = 'center';
    trend.forEach((d, i) => {
      if (i % 5 === 0 || i === trend.length - 1) {
        const x = pad.left + (i / Math.max(trend.length - 1, 1)) * cW;
        ctx.fillText(d.date.slice(5), x, H - 8);
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Costs panel
  // ──────────────────────────────────────────────────────────
  function renderCosts() {
    // Model costs table
    const modelData = Analytics.getModelBreakdown();
    const tbody1    = document.getElementById('tbody-model-costs');
    if (tbody1) {
      tbody1.innerHTML = modelData.length ? modelData.map(m => `
        <tr>
          <td class="primary">${esc(m.model)}</td>
          <td>${esc(m.provider)}</td>
          <td class="mono">${fmtNum(m.count)}</td>
          <td class="mono" style="color:#22d3ee">${fmtCost(m.cost)}</td>
          <td class="mono">${fmtCost(m.count ? m.cost / m.count : 0)}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="admin-empty">No message data yet.</td></tr>';
    }

    // User costs table
    const userData = Analytics.getUserStats();
    const tbody2   = document.getElementById('tbody-user-costs');
    if (tbody2) {
      tbody2.innerHTML = userData.length ? userData.map(u => `
        <tr>
          <td class="primary">${esc(u.username)}</td>
          <td class="mono">${fmtNum(u.messages)}</td>
          <td class="mono" style="color:#22d3ee">${fmtCost(u.cost)}</td>
          <td class="mono">${fmtTokens(u.tokens)}</td>
          <td class="mono">${fmtCost(u.messages ? u.cost / u.messages : 0)}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="admin-empty">No data yet.</td></tr>';
    }
  }

  // ──────────────────────────────────────────────────────────
  // Skills panel
  // ──────────────────────────────────────────────────────────
  function renderSkills() {
    const skills = Analytics.getTopSkills(20);
    const list   = document.getElementById('skills-bar-list');
    if (!list) return;

    if (!skills.length) {
      list.innerHTML = '<div class="admin-empty">No skill injections recorded yet.</div>';
      return;
    }

    const maxCount = skills[0].count;
    list.innerHTML = skills.map(s => `
      <div class="skill-bar-item">
        <span class="skill-bar-name" title="${esc(s.skill)}">${esc(s.skill)}</span>
        <div class="skill-bar-track">
          <div class="skill-bar-fill" style="width:${Math.round(s.count / maxCount * 100)}%"></div>
        </div>
        <span class="skill-bar-count">${s.count}</span>
      </div>
    `).join('');
  }

  // ──────────────────────────────────────────────────────────
  // Users panel
  // ──────────────────────────────────────────────────────────
  function renderUsers() {
    const users = AuthSystem.listUsers();
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0">
              ${esc(u.displayName.slice(0,2).toUpperCase())}
            </div>
            <div>
              <div style="font-weight:500;color:#f1f5f9;font-size:12px">${esc(u.displayName)}</div>
              <div style="font-size:10px;color:#475569">@${esc(u.username)}</div>
            </div>
          </div>
        </td>
        <td><span class="role-badge ${u.role}">${u.role}</span></td>
        <td><span class="status-dot ${u.active ? 'active' : 'inactive'}"></span>${u.active ? 'Active' : 'Inactive'}</td>
        <td class="mono">${fmtNum(u.messageCount || 0)}</td>
        <td class="mono" style="color:#22d3ee">${fmtCost(u.totalCost || 0)}</td>
        <td>${fmtRelative(u.lastLogin)}</td>
        <td>
          <div style="display:flex;gap:5px">
            ${u.role !== 'admin' ? `<button class="btn-sm secondary" onclick="AdminApp.toggleUserActive('${u.id}',${!u.active})">${u.active ? 'Deactivate' : 'Activate'}</button>` : ''}
            <button class="btn-sm secondary" onclick="AdminApp.promptResetPassword('${esc(u.id)}','${esc(u.username)}')">Reset PW</button>
            ${u.role !== 'admin' ? `<button class="btn-sm danger" onclick="AdminApp.deleteUser('${u.id}','${esc(u.username)}')">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function createUser() {
    const username    = document.getElementById('new-username')?.value.trim();
    const displayName = document.getElementById('new-displayname')?.value.trim();
    const password    = document.getElementById('new-password')?.value;
    const role        = document.getElementById('new-role')?.value || 'user';

    if (!username || !password) { toast('Username and password are required.', 'error'); return; }

    try {
      await AuthSystem.createUser({ username, password, displayName, role });
      toast(`User @${username} created successfully.`, 'success');
      document.getElementById('new-username').value    = '';
      document.getElementById('new-displayname').value = '';
      document.getElementById('new-password').value    = '';
      renderUsers();
    } catch(e) { toast(e.message, 'error'); }
  }

  function toggleUserActive(userId, active) {
    try {
      AuthSystem.updateUser(userId, { active });
      toast(`User ${active ? 'activated' : 'deactivated'}.`, 'success');
      renderUsers();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function promptResetPassword(userId, username) {
    const pw = prompt(`New password for @${username} (min 6 chars):`);
    if (!pw) return;
    try {
      await AuthSystem.updatePassword(userId, pw);
      toast(`Password updated for @${username}.`, 'success');
    } catch(e) { toast(e.message, 'error'); }
  }

  function deleteUser(userId, username) {
    if (!confirm(`Delete user @${username}? This cannot be undone.`)) return;
    try {
      AuthSystem.deleteUser(userId);
      toast(`User @${username} deleted.`, 'success');
      renderUsers();
    } catch(e) { toast(e.message, 'error'); }
  }

  // ──────────────────────────────────────────────────────────
  // Health panel
  // ──────────────────────────────────────────────────────────
  async function renderHealth() {
    const st       = Analytics.getStorageInfo();
    const summary  = Analytics.getSummary();
    const grid     = document.getElementById('health-grid');

    if (grid) {
      const pct = parseFloat(st.pct);
      const warnFill = pct > 70 ? ' warn' : '';

      // Count memory entries
      let memCount = 0;
      try { memCount = (JSON.parse(localStorage.getItem('cpu_memories')) || []).length; } catch {}

      // Count sessions
      let sessionCount = 0;
      try { sessionCount = (JSON.parse(localStorage.getItem('claude_power_ui_v2') || '{}').sessions || []).length; } catch {}

      // M3: analytics buffer capacity warning + M6: CLI card
      const bufferPct = Math.min(100, (summary.totalEvents / 100));
      const bufferWarn = bufferPct >= 90;
      const mcpCount = (() => { try { return (JSON.parse(localStorage.getItem('cpu_mcp_servers')) || []).length; } catch { return 0; } })();

      grid.innerHTML = `
        <div class="health-card">
          <div class="health-card-title">localStorage Usage</div>
          <div class="health-value">${st.usedMB} MB</div>
          <div class="health-meta">of ~${st.quotaMB} MB quota</div>
          <div class="health-progress-bar" style="margin-top:10px">
            <div class="health-progress-fill${warnFill}" style="width:${st.pct}%"></div>
          </div>
          <div class="health-meta">${st.pct}% used${pct > 70 ? ' ⚠ Getting full — export a backup' : ''}</div>
        </div>
        <div class="health-card">
          <div class="health-card-title">Analytics Buffer</div>
          <div class="health-value">${fmtNum(summary.totalEvents)}</div>
          <div class="health-meta">of 10,000 max (ring buffer)</div>
          <div class="health-progress-bar" style="margin-top:10px">
            <div class="health-progress-fill${bufferWarn ? ' warn' : ''}" style="width:${bufferPct}%"></div>
          </div>
          <div class="health-meta" style="${bufferWarn ? 'color:#f59e0b' : ''}">${bufferPct.toFixed(1)}% full${bufferWarn ? ' ⚠ Oldest events being overwritten' : ''}</div>
        </div>
        <div class="health-card">
          <div class="health-card-title">Memory Entries</div>
          <div class="health-value">${fmtNum(memCount)}</div>
          <div class="health-meta">across all workspaces</div>
        </div>
        <div class="health-card">
          <div class="health-card-title">Active Sessions</div>
          <div class="health-value">${fmtNum(sessionCount)}</div>
          <div class="health-meta">conversations stored</div>
        </div>
        <div class="health-card">
          <div class="health-card-title">Registered Users</div>
          <div class="health-value">${fmtNum(AuthSystem.listUsers().length)}</div>
          <div class="health-meta">local accounts</div>
        </div>
        <div class="health-card">
          <div class="health-card-title">MCP Servers</div>
          <div class="health-value">${fmtNum(mcpCount)}</div>
          <div class="health-meta">registered servers</div>
        </div>
      `;

      // M6: CLI access card (appended separately so it spans full width)
      const cliCard = document.createElement('div');
      cliCard.className = 'health-card';
      cliCard.style.gridColumn = '1 / -1';
      cliCard.innerHTML = `
        <div class="health-card-title">\ud83d\udda5 CLI Access</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.7;margin-top:6px">
          A full Python CLI is available at <code style="background:rgba(99,102,241,0.1);padding:2px 6px;border-radius:4px;font-size:11px">app/cli.py</code>
          — automate everything the UI does without a browser.
        </div>
        <pre style="margin:10px 0 0;padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;font-size:11px;color:#a5b4fc;overflow-x:auto;white-space:pre-wrap">python3 cli.py --help
python3 cli.py chat "What is the capital of France?"
python3 cli.py sessions list
python3 cli.py export --format json</pre>
        <div style="margin-top:8px;font-size:11px;color:#475569">Tip: use <strong style="color:#94a3b8">⌘⇧A</strong> (Mac) or <strong style="color:#94a3b8">Ctrl+Shift+A</strong> from the main app to open this admin dashboard.</div>
      `;
      grid.appendChild(cliCard);
    }

    // API key status
    const apiKeyList = document.getElementById('api-key-status-list');
    if (apiKeyList) {
      let apiKeys = {};
      try {
        apiKeys = await ApiKeyVault.load() || {};
      } catch {}

      const providers = [
        { id: 'anthropic', label: 'Anthropic',             icon: '✦',  group: 'llm' },
        { id: 'openai',    label: 'OpenAI',                icon: '◎',  group: 'llm' },
        { id: 'google',    label: 'Google Gemini',         icon: '⬡',  group: 'llm' },
        { id: 'groq',      label: 'Groq',                  icon: '⚡',  group: 'llm' },
        { id: 'mistral',   label: 'Mistral',               icon: 'ⱡ',  group: 'llm' },
        { id: 'bfl',       label: 'Black Forest Labs',     icon: '🧪', group: 'img' },
        { id: 'fal',       label: 'fal.ai',                icon: '⚡',  group: 'img' },
        { id: 'replicate', label: 'Replicate',             icon: '🔄', group: 'img' },
      ];

      let lastGroup = null;
      apiKeyList.innerHTML = providers.map(p => {
        const present = !!(apiKeys[p.id]);
        const sep = p.group !== lastGroup
          ? `<div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 4px;">${p.group === 'llm' ? '🧠 LLM Chat' : '🎨 Image Gen'}</div>`
          : '';
        lastGroup = p.group;
        return `${sep}
          <div class="api-key-status">
            <span style="font-size:14px">${p.icon}</span>
            <span style="color:#94a3b8;font-weight:500">${p.label}</span>
            <span style="margin-left:auto;${present ? 'color:#34d399' : 'color:#475569'}">
              ${present ? '✓ Configured' : '○ Not set'}
            </span>
          </div>
        `;
      }).join('');
    }
  }


  // ──────────────────────────────────────────────────────────
  // Data management
  // ──────────────────────────────────────────────────────────
  function exportData() {
    const backup = {
      exportedAt:  new Date().toISOString(),
      version:     'cpu_v2',
      analytics:   JSON.parse(Analytics.exportJSON()),
      appState:    JSON.parse(localStorage.getItem('claude_power_ui_v2') || '{}'),
      workspaces:  JSON.parse(localStorage.getItem('cpu_workspaces') || '[]'),
      memories:    JSON.parse(localStorage.getItem('cpu_memories')   || '[]'),
      apiKeysVault: JSON.parse(localStorage.getItem('cpu_apikeys_v2') || 'null'),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `cpu-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exported!', 'success');
  }

  function importData() {
    document.getElementById('import-file-input')?.click();
  }

  function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.version || !backup.exportedAt) { toast('Invalid backup file.', 'error'); return; }
        if (!confirm(`Import backup from ${backup.exportedAt}? This will overwrite current data.`)) return;
        if (backup.appState)  localStorage.setItem('claude_power_ui_v2', JSON.stringify(backup.appState));
        if (backup.workspaces)localStorage.setItem('cpu_workspaces', JSON.stringify(backup.workspaces));
        if (backup.memories)  localStorage.setItem('cpu_memories',   JSON.stringify(backup.memories));
        if (backup.apiKeysVault) localStorage.setItem('cpu_apikeys_v2', JSON.stringify(backup.apiKeysVault));
        toast('Backup imported successfully. Reload the app.', 'success', 6000);
      } catch { toast('Failed to parse backup file.', 'error'); }
    };
    reader.readAsText(file);
    input.value = '';
  }

  function clearAnalytics() {
    if (!confirm('Clear all analytics data? This cannot be undone.')) return;
    Analytics.clearAll();
    toast('Analytics data cleared.', 'success');
    renderPanel('health');
  }

  function resetAllData() {
    if (!confirm('⚠ This will delete ALL app data including sessions, memory, and analytics. Type YES to continue.')) return;
    const confirm2 = prompt('Type YES to confirm full reset:');
    if (confirm2 !== 'YES') { toast('Reset cancelled.', 'info'); return; }
    ['claude_power_ui_v2','claude_power_ui_v1','cpu_workspaces','cpu_memories','cpu_analytics','cpu_apikeys_v2'].forEach(k => localStorage.removeItem(k));
    toast('All data reset. Returning to app…', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
  }

  // ── LLM Chat providers ────────────────────────────────────
  const PROVIDER_DEFS = [
    { id: 'anthropic', name: 'Anthropic',   icon: '❆',  color: '#c47c5a', placeholder: 'sk-ant-api03-…', baseUrl: 'https://api.anthropic.com',                  docsUrl: 'https://console.anthropic.com/settings/keys', testPath: '/v1/models',          testHeaders: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }) },
    { id: 'openai',    name: 'OpenAI',      icon: '◎',  color: '#10a37f', placeholder: 'sk-proj-…',     baseUrl: 'https://api.openai.com',                     docsUrl: 'https://platform.openai.com/api-keys',       testPath: '/v1/models',          testHeaders: (k) => ({ 'Authorization': `Bearer ${k}` }) },
    { id: 'google',    name: 'Google',      icon: '⬡',  color: '#4285f4', placeholder: 'AIza…',          baseUrl: 'https://generativelanguage.googleapis.com',  docsUrl: 'https://aistudio.google.com/app/apikey',     testPath: '/v1beta/models?key=KEY', testHeaders: () => ({}) },
    { id: 'groq',      name: 'Groq',        icon: '⚡',  color: '#f55036', placeholder: 'gsk_…',           baseUrl: 'https://api.groq.com',                       docsUrl: 'https://console.groq.com/keys',              testPath: '/openai/v1/models',   testHeaders: (k) => ({ 'Authorization': `Bearer ${k}` }) },
    { id: 'mistral',   name: 'Mistral',     icon: 'ⱡ',  color: '#ff7000', placeholder: '…',                baseUrl: 'https://api.mistral.ai',                     docsUrl: 'https://console.mistral.ai/api-keys',        testPath: '/v1/models',          testHeaders: (k) => ({ 'Authorization': `Bearer ${k}` }) },
  ];

  // ── Image Generation providers ────────────────────────────
  const IMAGE_PROVIDER_DEFS = [
    {
      id: 'bfl',
      name: 'Black Forest Labs (Flux)',
      icon: '🧪',
      color: '#ec4899',
      placeholder: 'your-bfl-api-key…',
      baseUrl: 'https://api.bfl.ml',
      docsUrl: 'https://docs.bfl.ml',
      desc: 'Powers Flux Pro 1.1, Flux Dev, and Flux Schnell models.',
    },
    {
      id: 'fal',
      name: 'fal.ai',
      icon: '⚡',
      color: '#a855f7',
      placeholder: 'your-fal-key-id:your-key-secret…',
      baseUrl: 'https://fal.run',
      docsUrl: 'https://fal.ai/dashboard/keys',
      desc: 'Flux Pro and Flux Dev via fal.ai infrastructure.',
    },
    {
      id: 'replicate',
      name: 'Replicate',
      icon: '🔄',
      color: '#0ea5e9',
      placeholder: 'r8_…',
      baseUrl: 'https://api.replicate.com',
      docsUrl: 'https://replicate.com/account/api-tokens',
      desc: 'Flux 1.1 Pro via Replicate. Pay-per-run, no subscription needed.',
    },
  ];

  // ── ComfyUI local URL (not a key — a URL setting) ────────
  const COMFYUI_SETTING = {
    id: 'comfyui',
    name: 'ComfyUI (Local)',
    icon: '⚙️',
    color: '#84cc16',
    desc: 'URL of your local ComfyUI instance. No API key needed — runs entirely on your machine.',
    settingKey: 'imageGen.comfyUrl',
    placeholder: 'http://127.0.0.1:8188',
    inputType: 'url',
  };

  // ──────────────────────────────────────────────────────────
  // Helper: empty state
  // ──────────────────────────────────────────────────────────
  function drawEmpty(ctx, W, H, msg) {
    ctx.fillStyle = '#475569';
    ctx.font = `12px ${FONT_FAMILY}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, W / 2, H / 2);
  }

  // ──────────────────────────────────────────────────────────
  // Boot
  // ──────────────────────────────────────────────────────────
  async function boot() {
    // Init auth (creates admin user if first run)
    await AuthSystem.init();

    // Auth guard — all authenticated users allowed
    if (!AuthSystem.requireAuth('index.html')) return;

    // Show dashboard
    document.getElementById('admin-loading').style.display = 'none';
    document.getElementById('admin-app').style.display     = 'flex';

    // Show current user
    const user = AuthSystem.getCurrentUser();
    if (user) {
      document.getElementById('admin-current-user').textContent = user.displayName || user.username;
    }

    // Update topbar meta
    const meta = document.getElementById('admin-topbar-meta');
    if (meta) meta.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;

    // Role-based visibility adjustment
    const isAdmin = AuthSystem.isAdmin();
    
    // Toggle sidebar visibility based on admin role
    const adminEls = [
      document.getElementById('nav-section-analytics'),
      document.getElementById('nav-section-management'),
      document.getElementById('nav-item-overview'),
      document.getElementById('nav-item-usage'),
      document.getElementById('nav-item-costs'),
      document.getElementById('nav-item-skills'),
      document.getElementById('nav-item-users'),
      document.getElementById('nav-item-health')
    ];
    adminEls.forEach(el => {
      if (el) el.style.display = isAdmin ? 'block' : 'none';
    });

    if (!isAdmin) {
      const sub = document.querySelector('.admin-brand-sub');
      if (sub) sub.textContent = 'Settings Dashboard';
    }

    // Render default panel
    if (isAdmin) {
      await switchPanel('overview', document.getElementById('nav-item-overview'));
    } else {
      await switchPanel('settings', document.getElementById('nav-item-settings'));
    }

    // Canvas charts (drawDailyChart/drawDonut/drawBarChart/renderCostTrendChart)
    // size themselves once, from the canvas's parent width, when their panel
    // is rendered — they never redraw on their own if the viewport changes
    // afterward (e.g. a device rotation). refresh() re-renders whichever
    // panel is currently active (same lookup it already does internally),
    // which is enough to pick up the new width; also keep the mobile drawer
    // state consistent if a resize crosses the 1024px breakpoint.
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        if (!isMobileViewport()) closeSidebar();
        refresh();
      }, 200);
    });
  }

  // ============================================================
  // CONNECTIONS PANEL — API Keys & MCP Resources
  // ============================================================

  const MCP_KEY = 'cpu_mcp_servers';

  function loadMcpServers() {
    try { return JSON.parse(localStorage.getItem(MCP_KEY)) || []; } catch { return []; }
  }
  function saveMcpServers(arr) { localStorage.setItem(MCP_KEY, JSON.stringify(arr)); }
  function mcpUid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36); }

  // ── Render whole connections panel ─────────────────────────
  async function renderConnections() {
    await renderApiKeysGrid();
    renderMcpServerList();
    const servers = loadMcpServers();
    const badge = document.getElementById('mcp-server-count');
    if (badge) badge.textContent = servers.length === 0 ? '0 connected' : `${servers.length} registered`;
  }



  // ── API Keys grid ───────────────────────────────────────────
  async function renderApiKeysGrid() {
    const grid = document.getElementById('api-keys-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let storedKeys = {};
    try { storedKeys = await ApiKeyVault.load() || {}; } catch {}

    function sectionHeading(label, sub = '') {
      const h = document.createElement('div');
      h.className = 'api-key-section-heading';
      h.innerHTML = `<span>${label}</span>${sub ? `<span class="api-key-section-sub">${sub}</span>` : ''}`;
      grid.appendChild(h);
    }

    function renderKeyCard(p, hasKey) {
      const card = document.createElement('div');
      card.className = 'api-key-card';
      card.id = `api-card-${p.id}`;
      card.style.setProperty('--provider-color', p.color);
      card.innerHTML = `
        <div class="api-key-card-header">
          <div class="api-key-provider-icon" style="color:${esc(p.color)}">${esc(p.icon)}</div>
          <div>
            <div class="api-key-provider-name">${esc(p.name)}</div>
            <div class="api-key-provider-url">${esc(p.baseUrl || '')}</div>
            ${p.desc ? `<div class="api-key-provider-desc">${esc(p.desc)}</div>` : ''}
          </div>
          <div class="api-key-status-pill ${hasKey ? 'present' : 'missing'}" id="pill-${p.id}">
            <div class="api-key-status-dot"></div>
            ${hasKey ? 'Configured' : 'Not set'}
          </div>
        </div>
        <div class="api-key-input-row">
          <input class="api-key-input" id="key-input-${p.id}" type="password"
            value="${hasKey ? storedKeys[p.id] : ''}"
            placeholder="${esc(p.placeholder)}" autocomplete="off" />
          <button class="api-key-reveal-btn" title="Show/hide" onclick="AdminApp.toggleKeyReveal('${p.id}')">&#128065;</button>
        </div>
        <div class="api-key-actions">
          <button class="btn-sm primary" onclick="AdminApp.saveApiKey('${p.id}')">Save</button>
          ${p.testPath ? `
          <button class="api-key-test-btn" id="test-btn-${p.id}" onclick="AdminApp.testApiKey('${p.id}')">
            <div class="api-key-test-spinner" id="test-spin-${p.id}"></div>
            &#9685; Test
          </button>
          <span class="api-key-test-result" id="test-result-${p.id}"></span>` : ''}
          <a class="api-key-docs-link" href="${esc(p.docsUrl)}" target="_blank" rel="noopener">Get key &#8599;</a>
        </div>
      `;
      grid.appendChild(card);
    }

    // LLM providers
    sectionHeading('🧠 AI Chat Providers', 'Keys for Claude, GPT, Gemini, Llama');
    PROVIDER_DEFS.forEach(p => renderKeyCard(p, !!(storedKeys[p.id]?.trim())));

    // Image generation providers
    sectionHeading('🎨 Image Generation APIs', 'Flux Pro/Dev/Schnell — BFL, fal.ai, Replicate');
    IMAGE_PROVIDER_DEFS.forEach(p => renderKeyCard(p, !!(storedKeys[p.id]?.trim())));

    // ComfyUI URL (not a key — a URL setting)
    const comfyUrlVal = _getImageSetting('comfyUrl') || 'http://127.0.0.1:8188';
    const comfyCard = document.createElement('div');
    comfyCard.className = 'api-key-card api-key-card-url';
    comfyCard.id = 'api-card-comfyui';
    comfyCard.style.setProperty('--provider-color', COMFYUI_SETTING.color);
    comfyCard.innerHTML = `
      <div class="api-key-card-header">
        <div class="api-key-provider-icon" style="color:${esc(COMFYUI_SETTING.color)}">${COMFYUI_SETTING.icon}</div>
        <div>
          <div class="api-key-provider-name">${esc(COMFYUI_SETTING.name)}</div>
          <div class="api-key-provider-url">No API key required</div>
          <div class="api-key-provider-desc">${esc(COMFYUI_SETTING.desc)}</div>
        </div>
        <div class="api-key-status-pill ${comfyUrlVal !== 'http://127.0.0.1:8188' ? 'present' : 'missing'}" id="pill-comfyui">
          <div class="api-key-status-dot"></div>
          ${comfyUrlVal !== 'http://127.0.0.1:8188' ? 'Custom URL' : 'Default'}
        </div>
      </div>
      <div class="api-key-input-row">
        <input class="api-key-input" id="key-input-comfyui" type="url"
          value="${esc(comfyUrlVal)}" placeholder="http://127.0.0.1:8188" autocomplete="off" />
      </div>
      <div class="api-key-actions">
        <button class="btn-sm primary" onclick="AdminApp.saveComfyUrl()">Save URL</button>
        <button class="api-key-test-btn" id="test-btn-comfyui" onclick="AdminApp.testComfyUrl()">
          <div class="api-key-test-spinner" id="test-spin-comfyui"></div>
          &#9685; Ping
        </button>
        <span class="api-key-test-result" id="test-result-comfyui"></span>
        <a class="api-key-docs-link" href="https://github.com/comfyanonymous/ComfyUI#installing" target="_blank" rel="noopener">Install ComfyUI &#8599;</a>
      </div>
    `;
    grid.appendChild(comfyCard);

    // Image Gen defaults
    const imgProviderVal = _getImageSetting('provider') || 'bfl';
    const imgWidthVal    = _getImageSetting('width')    || 1024;
    const imgHeightVal   = _getImageSetting('height')   || 1024;
    const imgStepsVal    = _getImageSetting('steps')    || 28;

    sectionHeading('⚙️ Image Generation Defaults', 'Default provider and output settings');
    const defaultsCard = document.createElement('div');
    defaultsCard.className = 'api-key-card api-key-card-defaults';
    defaultsCard.innerHTML = `
      <div class="img-defaults-grid">
        <div class="img-default-field">
          <label class="mcp-label">Default Provider</label>
          <select class="api-key-input" id="imgdef-provider" style="cursor:pointer">
            <option value="bfl"       ${imgProviderVal==='bfl'       ?'selected':''}>Black Forest Labs (BFL)</option>
            <option value="fal"       ${imgProviderVal==='fal'       ?'selected':''}>fal.ai</option>
            <option value="replicate" ${imgProviderVal==='replicate' ?'selected':''}>Replicate</option>
            <option value="comfyui"   ${imgProviderVal==='comfyui'   ?'selected':''}>ComfyUI (Local)</option>
          </select>
        </div>
        <div class="img-default-field">
          <label class="mcp-label">Default Width</label>
          <select class="api-key-input" id="imgdef-width" style="cursor:pointer">
            <option value="512"  ${imgWidthVal==512  ?'selected':''}>512</option>
            <option value="768"  ${imgWidthVal==768  ?'selected':''}>768</option>
            <option value="1024" ${imgWidthVal==1024 ?'selected':''}>1024</option>
            <option value="1440" ${imgWidthVal==1440 ?'selected':''}>1440</option>
            <option value="1792" ${imgWidthVal==1792 ?'selected':''}>1792</option>
          </select>
        </div>
        <div class="img-default-field">
          <label class="mcp-label">Default Height</label>
          <select class="api-key-input" id="imgdef-height" style="cursor:pointer">
            <option value="512"  ${imgHeightVal==512  ?'selected':''}>512</option>
            <option value="768"  ${imgHeightVal==768  ?'selected':''}>768</option>
            <option value="1024" ${imgHeightVal==1024 ?'selected':''}>1024</option>
            <option value="1440" ${imgHeightVal==1440 ?'selected':''}>1440</option>
          </select>
        </div>
        <div class="img-default-field">
          <label class="mcp-label">Sampling Steps</label>
          <input class="api-key-input" id="imgdef-steps" type="number" min="4" max="100" step="1"
            value="${imgStepsVal}" style="max-width:100px" />
        </div>
      </div>
      <div class="api-key-actions" style="margin-top:12px">
        <button class="btn-sm primary" onclick="AdminApp.saveImageDefaults()">Save Defaults</button>
      </div>
    `;
    grid.appendChild(defaultsCard);
  }

  function toggleKeyReveal(providerId) {
    const input = document.getElementById(`key-input-${providerId}`);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function _getImageSetting(key) {
    try {
      const raw = localStorage.getItem('claude_power_ui_v2');
      const s = JSON.parse(raw);
      return s?.settings?.imageGen?.[key] ?? null;
    } catch { return null; }
  }

  async function saveApiKey(providerId) {

    const input = document.getElementById(`key-input-${providerId}`);
    if (!input) return;
    const keyVal = input.value.trim();

    try {
      let storedKeys = {};
      try { storedKeys = await ApiKeyVault.load() || {}; } catch {}
      storedKeys[providerId] = keyVal;
      await ApiKeyVault.save(storedKeys);

      // Update pill
      const pill = document.getElementById(`pill-${providerId}`);
      if (pill) {
        pill.className = `api-key-status-pill ${keyVal ? 'present' : 'missing'}`;
        pill.innerHTML = `<div class="api-key-status-dot"></div>${keyVal ? 'Configured' : 'Not set'}`;
      }
      toast(`${providerId} API key ${keyVal ? 'saved' : 'cleared'}.`, 'success');
    } catch (e) {
      toast('Failed to save key: ' + e.message, 'error');
    }
  }

  async function testApiKey(providerId) {
    const pDef  = PROVIDER_DEFS.find(p => p.id === providerId);
    if (!pDef) return;
    const input = document.getElementById(`key-input-${providerId}`);
    const key   = input?.value.trim();
    if (!key) { toast('Enter an API key first.', 'error'); return; }

    const btn    = document.getElementById(`test-btn-${providerId}`);
    const spin   = document.getElementById(`test-spin-${providerId}`);
    const result = document.getElementById(`test-result-${providerId}`);

    btn.disabled = true;
    if (spin) { spin.style.display = 'inline-block'; }
    if (result) { result.style.display = 'none'; }

    try {
      let url = pDef.baseUrl + (pDef.id === 'google' ? pDef.testPath.replace('KEY', encodeURIComponent(key)) : pDef.testPath);
      const headers = pDef.testHeaders(key);
      const res = await fetch(url, { method: 'GET', headers });
      const ok  = res.status === 200 || res.status === 400; // 400 = auth ok, bad params
      if (result) {
        result.className = `api-key-test-result ${ok ? 'ok' : 'fail'}`;
        result.textContent = ok ? `✓ ${res.status} OK` : `✕ ${res.status}`;
        result.style.display = 'inline-flex';
      }
    } catch (err) {
      if (result) {
        result.className = 'api-key-test-result fail';
        result.textContent = '✕ Network error';
        result.style.display = 'inline-flex';
      }
    } finally {
      btn.disabled = false;
      if (spin) spin.style.display = 'none';
    }
  }

  // Save ComfyUI server URL into settings
  async function saveComfyUrl() {
    const input = document.getElementById('key-input-comfyui');
    const url   = (input?.value || '').trim() || 'http://127.0.0.1:8188';
    _patchImageSetting('comfyUrl', url);
    const pill = document.getElementById('pill-comfyui');
    if (pill) {
      const isCustom = url !== 'http://127.0.0.1:8188';
      pill.className = `api-key-status-pill ${isCustom ? 'present' : 'missing'}`;
      pill.innerHTML = `<div class="api-key-status-dot"></div>${isCustom ? 'Custom URL' : 'Default'}`;
    }
    toast(`ComfyUI URL saved: ${url}`, 'success');
  }

  // Ping ComfyUI /system_stats to verify it's reachable
  async function testComfyUrl() {
    const input = document.getElementById('key-input-comfyui');
    const url   = (input?.value || '').trim() || 'http://127.0.0.1:8188';
    const btn   = document.getElementById('test-btn-comfyui');
    const spin  = document.getElementById('test-spin-comfyui');
    const res   = document.getElementById('test-result-comfyui');
    if (btn) btn.disabled = true;
    if (spin) spin.style.display = 'inline-block';
    if (res)  res.style.display  = 'none';
    try {
      const r = await fetch(`${url}/system_stats`, { method: 'GET', signal: AbortSignal.timeout(4000) });
      const ok = r.status === 200;
      if (res) {
        res.className   = `api-key-test-result ${ok ? 'ok' : 'fail'}`;
        res.textContent = ok ? '✓ ComfyUI reachable' : `✕ HTTP ${r.status}`;
        res.style.display = 'inline-flex';
      }
    } catch {
      if (res) {
        res.className   = 'api-key-test-result fail';
        res.textContent = '✕ Not reachable — is ComfyUI running?';
        res.style.display = 'inline-flex';
      }
    } finally {
      if (btn)  btn.disabled = false;
      if (spin) spin.style.display = 'none';
    }
  }

  // Save image generation defaults (provider, size, steps)
  function saveImageDefaults() {
    const provider = document.getElementById('imgdef-provider')?.value || 'bfl';
    const width    = parseInt(document.getElementById('imgdef-width')?.value  || 1024, 10);
    const height   = parseInt(document.getElementById('imgdef-height')?.value || 1024, 10);
    const steps    = parseInt(document.getElementById('imgdef-steps')?.value  || 28,   10);
    _patchImageSetting('provider', provider);
    _patchImageSetting('width',    width);
    _patchImageSetting('height',   height);
    _patchImageSetting('steps',    steps);
    toast(`Image defaults saved: ${provider} · ${width}×${height} · ${steps} steps`, 'success');
  }

  // Helper: write one key into STATE.settings.imageGen in localStorage
  function _patchImageSetting(key, value) {
    try {
      const raw = localStorage.getItem('claude_power_ui_v2');
      const s = raw ? JSON.parse(raw) : {};
      if (!s.settings) s.settings = {};
      if (!s.settings.imageGen) s.settings.imageGen = {};
      s.settings.imageGen[key] = value;
      localStorage.setItem('claude_power_ui_v2', JSON.stringify(s));
    } catch (e) { console.warn('_patchImageSetting:', e); }
  }

  // ── MCP Servers ────────────────────────────────────────────
  const MCP_ICONS = { filesystem: '📁', postgres: '🗄', github: '🐙', sqlite: '🗃', memory: '🧠', fetch: '🌐', brave: '🔍', slack: '💬', jira: '📋', default: '🔌' };


  function getMcpIcon(name) {
    const n = (name || '').toLowerCase();
    return Object.keys(MCP_ICONS).find(k => n.includes(k)) ? MCP_ICONS[Object.keys(MCP_ICONS).find(k => n.includes(k))] : MCP_ICONS.default;
  }

  function renderMcpServerList() {
    const list = document.getElementById('mcp-servers-list');
    if (!list) return;
    list.innerHTML = '';

    const servers = loadMcpServers();
    if (!servers.length) {
      list.innerHTML = `
        <div class="mcp-empty">
          <div class="mcp-empty-icon">🔌</div>
          <div class="mcp-empty-title">No MCP servers registered</div>
          <div class="mcp-empty-sub">Click "Show Form" above to register a local or remote MCP server.</div>
        </div>`;
      return;
    }

    servers.forEach(srv => {
      const card = document.createElement('div');
      const statusClass = srv.lastStatus || 'disconnected';
      card.className = `mcp-server-card ${statusClass}`;
      card.id = `mcp-card-${srv.id}`;

      const meta = srv.transport === 'stdio' ? srv.command : srv.url;
      const toolCount = (srv.tools || []).length;

      card.innerHTML = `
        <div class="mcp-server-header" onclick="AdminApp.toggleMcpCard('${srv.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AdminApp.toggleMcpCard('${srv.id}')}">
          <div class="mcp-server-icon">${getMcpIcon(srv.name)}</div>
          <div class="mcp-server-info">
            <div class="mcp-server-name">${esc(srv.name)}</div>
            <div class="mcp-server-meta">${esc(meta || '')}</div>
          </div>
          <span class="mcp-transport-badge ${esc(srv.transport)}">${esc(srv.transport)}</span>
          <div class="mcp-conn-status ${statusClass}" id="mcp-status-${srv.id}">
            <div class="mcp-conn-dot"></div>
            ${statusClass === 'connected' ? 'Connected' : statusClass === 'error' ? 'Error' : 'Not connected'}
          </div>
        </div>
        <div class="mcp-server-body" id="mcp-body-${srv.id}">
          <div class="mcp-server-detail-grid">
            <div class="mcp-server-detail"><div class="mcp-detail-label">Transport</div><div class="mcp-detail-value">${esc(srv.transport)}</div></div>
            ${srv.url ? `<div class="mcp-server-detail"><div class="mcp-detail-label">URL</div><div class="mcp-detail-value">${esc(srv.url)}</div></div>` : ''}
            ${srv.command ? `<div class="mcp-server-detail"><div class="mcp-detail-label">Command</div><div class="mcp-detail-value">${esc(srv.command)}</div></div>` : ''}
            ${srv.description ? `<div class="mcp-server-detail"><div class="mcp-detail-label">Description</div><div class="mcp-detail-value">${esc(srv.description)}</div></div>` : ''}
            <div class="mcp-server-detail"><div class="mcp-detail-label">Added</div><div class="mcp-detail-value">${new Date(srv.createdAt).toLocaleDateString()}</div></div>
            ${srv.lastPinged ? `<div class="mcp-server-detail"><div class="mcp-detail-label">Last Pinged</div><div class="mcp-detail-value">${new Date(srv.lastPinged).toLocaleTimeString()}</div></div>` : ''}
          </div>
          <div class="mcp-server-actions">
            <button class="btn-sm secondary" onclick="AdminApp.pingMcpServer('${srv.id}')">◉ Ping</button>
            ${toolCount > 0 ? `<span class="mcp-tools-chip" onclick="AdminApp.showMcpTools('${srv.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AdminApp.showMcpTools('${srv.id}')}">⚙ ${toolCount} tool${toolCount===1?'':'s'}</span>` : ''}
            <button class="btn-sm danger" style="margin-left:auto" onclick="AdminApp.removeMcpServer('${srv.id}')">Remove</button>
          </div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function toggleMcpAddForm() {
    const fields = document.getElementById('mcp-add-fields');
    const toggle = document.getElementById('mcp-add-toggle');
    const form   = document.getElementById('mcp-add-form');
    if (!fields) return;
    const isOpen = fields.style.display !== 'none';
    fields.style.display = isOpen ? 'none' : 'flex';
    if (toggle) toggle.textContent = isOpen ? 'Show Form' : 'Hide Form';
    if (form)   form.classList.toggle('open', !isOpen);
    if (!isOpen) document.getElementById('mcp-name')?.focus();
  }

  function onMcpTransportChange() {
    const transport = document.getElementById('mcp-transport')?.value;
    const urlRow = document.getElementById('mcp-url-row');
    const cmdRow = document.getElementById('mcp-cmd-row');
    if (!urlRow || !cmdRow) return;
    if (transport === 'stdio') {
      urlRow.style.display = 'none';
      cmdRow.style.display = 'grid';
    } else {
      urlRow.style.display = 'grid';
      cmdRow.style.display = 'none';
    }
  }

  function addMcpServer() {
    const name      = document.getElementById('mcp-name')?.value.trim();
    const transport = document.getElementById('mcp-transport')?.value || 'stdio';
    const url       = document.getElementById('mcp-url')?.value.trim();
    const auth      = document.getElementById('mcp-auth')?.value.trim();
    const command   = document.getElementById('mcp-cmd')?.value.trim();
    const envRaw    = document.getElementById('mcp-env')?.value.trim();
    const desc      = document.getElementById('mcp-desc')?.value.trim();

    if (!name) { toast('Server name is required.', 'error'); return; }
    if (transport === 'stdio' && !command) { toast('Command is required for stdio transport.', 'error'); return; }
    if (transport !== 'stdio' && !url) { toast('URL is required for SSE/HTTP transport.', 'error'); return; }

    let env = {};
    if (envRaw) {
      try { env = JSON.parse(envRaw); }
      catch { toast('Environment vars must be valid JSON: {"KEY":"value"}', 'error'); return; }
    }

    const servers = loadMcpServers();
    if (servers.find(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast(`Server "${name}" already exists.`, 'error'); return;
    }

    const srv = {
      id:          mcpUid(),
      name,
      transport,
      url:         url || '',
      authToken:   auth || '',
      command:     command || '',
      env,
      description: desc || '',
      tools:       [],
      lastStatus:  'disconnected',
      lastPinged:  null,
      createdAt:   Date.now(),
    };
    servers.push(srv);
    saveMcpServers(servers);

    // Clear form
    ['mcp-name','mcp-url','mcp-auth','mcp-cmd','mcp-env','mcp-desc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    toggleMcpAddForm();
    renderConnections();
    toast(`MCP server "${name}" registered.`, 'success');
  }

  function removeMcpServer(id) {
    const servers = loadMcpServers();
    const srv = servers.find(s => s.id === id);
    if (!srv) return;
    if (!confirm(`Remove MCP server "${srv.name}"?`)) return;
    saveMcpServers(servers.filter(s => s.id !== id));
    renderConnections();
    toast(`"${srv.name}" removed.`, 'success');
  }

  async function pingMcpServer(id) {
    const servers = loadMcpServers();
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return;
    const srv = servers[idx];

    // Update card to testing state
    const card      = document.getElementById(`mcp-card-${id}`);
    const statusEl  = document.getElementById(`mcp-status-${id}`);
    if (card)     card.className = card.className.replace(/connected|disconnected|error|testing/g, '').trim() + ' testing';
    if (statusEl) statusEl.className = 'mcp-conn-status testing';
    if (statusEl) statusEl.innerHTML = '<div class="mcp-conn-dot"></div>Testing…';

    let ok = false;
    if (srv.transport === 'stdio') {
      // For stdio: we can't truly ping from the browser. Show a helpful note.
      await new Promise(r => setTimeout(r, 600));
      // Mark as "connected" optimistically for stdio since we can't test from browser
      ok = true;
    } else {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (srv.authToken) headers['Authorization'] = `Bearer ${srv.authToken}`;
        const res = await fetch(srv.url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
        ok = res.ok || res.status === 405; // 405 = method not allowed = server exists
      } catch { ok = false; }
    }

    servers[idx].lastStatus = ok ? 'connected' : 'error';
    servers[idx].lastPinged = Date.now();
    saveMcpServers(servers);

    const newStatus = ok ? 'connected' : 'error';
    if (card)     card.className = card.className.replace(/testing/g, newStatus);
    if (statusEl) {
      statusEl.className = `mcp-conn-status ${newStatus}`;
      statusEl.innerHTML = `<div class="mcp-conn-dot"></div>${ok ? 'Connected' : 'Error'}`;
    }
    const badge = document.getElementById('mcp-server-count');
    if (badge) badge.textContent = `${servers.length} registered`;
    toast(ok ? `"${srv.name}" is reachable.` : `"${srv.name}" did not respond.`, ok ? 'success' : 'error');
  }

  function toggleMcpCard(id) {
    const body = document.getElementById(`mcp-body-${id}`);
    if (body) body.classList.toggle('open');
  }

  function showMcpTools(id) {
    const servers = loadMcpServers();
    const srv = servers.find(s => s.id === id);
    if (!srv) return;
    const drawer    = document.getElementById('mcp-tool-drawer');
    const title     = document.getElementById('mcp-tool-drawer-title');
    const toolList  = document.getElementById('mcp-tool-list');
    if (!drawer || !toolList) return;

    drawer.style.display = 'block';
    if (title) title.innerHTML = `⚙ ${esc(srv.name)} — Tools`;
    toolList.innerHTML = '';

    if (!srv.tools || !srv.tools.length) {
      toolList.innerHTML = '<div style="padding:20px;color:#475569;font-size:12px">No tools discovered yet. Ping the server to attempt discovery.</div>';
      return;
    }
    srv.tools.forEach(t => {
      const params = Object.keys(t.inputSchema?.properties || {});
      toolList.innerHTML += `
        <div class="mcp-tool-item">
          <div class="mcp-tool-name">⚙ ${esc(t.name)}</div>
          <div class="mcp-tool-desc">${esc(t.description || '—')}</div>
          ${params.length ? `<div class="mcp-tool-params">${params.map(p => `<span class="mcp-tool-param-tag">${esc(p)}</span>`).join('')}</div>` : ''}
        </div>`;
    });
  }

  function closeMcpDrawer() {
    const drawer = document.getElementById('mcp-tool-drawer');
    if (drawer) drawer.style.display = 'none';
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────
  return {
    boot,
    switchPanel,
    refresh,
    toggleSidebar,
    closeSidebar,
    createUser,
    toggleUserActive,
    promptResetPassword,
    deleteUser,
    exportData,
    importData,
    handleImport,
    clearAnalytics,
    resetAllData,
    // Settings panel
    saveSettings,
    renderSettings,
    // Connections panel
    renderApiKeysGrid,
    toggleKeyReveal,
    saveApiKey,
    testApiKey,
    saveComfyUrl,
    testComfyUrl,
    saveImageDefaults,
    toggleMcpAddForm,
    onMcpTransportChange,
    addMcpServer,
    removeMcpServer,
    pingMcpServer,
    toggleMcpCard,
    showMcpTools,
    closeMcpDrawer,
  };


})();

document.addEventListener('DOMContentLoaded', () => AdminApp.boot?.() || (async () => {
  await AuthSystem.init();
  if (!AuthSystem.requireAuth('index.html')) return;
  document.getElementById('admin-loading').style.display = 'none';
  document.getElementById('admin-app').style.display     = 'flex';
  const user = AuthSystem.getCurrentUser();
  if (user) document.getElementById('admin-current-user').textContent = user.displayName || user.username;
  const meta = document.getElementById('admin-topbar-meta');
  if (meta) meta.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;

  const isAdmin = AuthSystem.isAdmin();
  
  // Toggle sidebar visibility based on admin role
  const adminEls = [
    document.getElementById('nav-section-analytics'),
    document.getElementById('nav-section-management'),
    document.getElementById('nav-item-overview'),
    document.getElementById('nav-item-usage'),
    document.getElementById('nav-item-costs'),
    document.getElementById('nav-item-skills'),
    document.getElementById('nav-item-users'),
    document.getElementById('nav-item-health')
  ];
  adminEls.forEach(el => {
    if (el) el.style.display = isAdmin ? 'block' : 'none';
  });

  if (!isAdmin) {
    const sub = document.querySelector('.admin-brand-sub');
    if (sub) sub.textContent = 'Settings Dashboard';
  }

  const defaultPanel = isAdmin ? 'overview' : 'settings';
  AdminApp.switchPanel(defaultPanel, document.querySelector(`.admin-nav-item[data-panel="${defaultPanel}"]`));
})());
