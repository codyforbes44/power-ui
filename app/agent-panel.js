/**
 * agent-panel.js — Renders the Super Admin Agent configuration panel in admin.html
 * Called by admin.js renderPanel() as: await renderAgentPanel?.()
 */

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Panel renderer ───────────────────────────────────────────────────────────
async function renderAgentPanel() {
  const panel = document.getElementById('panel-agent');
  if (!panel) return;

  if (typeof SuperAgent === 'undefined') {
    panel.innerHTML = `<div class="admin-panel-header"><h2>🤖 Agent</h2><p style="color:#f87171">SuperAgent not loaded. Ensure agent.js is included before agent-panel.js.</p></div>`;
    return;
  }

  const cfg  = SuperAgent.config.get();
  const docs = await SuperAgent.kb.listAll();
  const mems = SuperAgent.memory.getAll();

  const toolRows = [
    { key: 'webSearch',    icon: '🔍', label: 'Web Search',           desc: 'Search the live internet (DuckDuckGo)' },
    { key: 'wikipedia',    icon: '📖', label: 'Wikipedia',            desc: 'Authoritative reference lookups (free, no key)' },
    { key: 'weather',      icon: '🌤', label: 'Live Weather',         desc: 'Current conditions anywhere (free, no key)' },
    { key: 'githubSearch', icon: '🐙', label: 'GitHub Search',        desc: 'Repositories, code, users (public API)' },
    { key: 'news',         icon: '📰', label: 'News Headlines',       desc: 'Latest articles (GNews key optional)' },
    { key: 'knowledgeBase',icon: '📚', label: 'Knowledge Base',       desc: 'Search uploaded documents & ingested URLs' },
    { key: 'crossMemory',  icon: '🧠', label: 'Cross-Session Memory', desc: 'Facts persist across ALL chat sessions' },
  ];

  panel.innerHTML = `
    <div class="admin-panel-header">
      <h2 class="admin-panel-title">🤖 Super Admin Agent</h2>
      <p class="admin-panel-subtitle">Exclusive to super-admin users. Configure the AI agent persona, tools, knowledge base, and persistent memory.</p>
    </div>

    <!-- ── Status bar ── -->
    <div class="admin-card" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="display:flex;gap:20px">
        <div><div class="stat-label">Status</div>
          <div class="stat-value" style="font-size:1.1rem;color:${cfg.enabled ? '#4ade80' : '#f87171'}">${cfg.enabled ? '● Active' : '○ Disabled'}</div>
        </div>
        <div><div class="stat-label">KB Documents</div><div class="stat-value" style="font-size:1.4rem">${docs.length}</div></div>
        <div><div class="stat-label">Agent Memories</div><div class="stat-value" style="font-size:1.4rem">${mems.length}</div></div>
        <div><div class="stat-label">Tools Enabled</div>
          <div class="stat-value" style="font-size:1.4rem">${Object.values(cfg.tools).filter(Boolean).length}/${toolRows.length}</div>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="agent-enabled" ${cfg.enabled ? 'checked' : ''} onchange="AgentPanel.toggleEnabled(this.checked)" style="width:18px;height:18px;cursor:pointer" />
        <span style="font-size:13px;font-weight:600">Agent Active</span>
      </label>
    </div>

    <!-- ── Tabs ── -->
    <div class="agent-tabs" id="agent-tabs">
      <button class="agent-tab active" data-tab="persona" onclick="AgentPanel.switchTab('persona',this)">👤 Persona</button>
      <button class="agent-tab" data-tab="tools" onclick="AgentPanel.switchTab('tools',this)">🔧 Tools</button>
      <button class="agent-tab" data-tab="kb" onclick="AgentPanel.switchTab('kb',this)">📚 Knowledge Base</button>
      <button class="agent-tab" data-tab="memory" onclick="AgentPanel.switchTab('memory',this)">🧠 Memory</button>
    </div>

    <!-- ── Persona tab ── -->
    <div class="agent-tab-panel active" id="agent-tab-persona">
      <div class="admin-card" style="margin-top:12px">
        <div style="display:grid;grid-template-columns:80px 1fr;gap:16px;margin-bottom:16px">
          <div>
            <label class="conn-field-label">Avatar</label>
            <input type="text" id="agent-avatar" value="${esc(cfg.avatarEmoji)}" maxlength="2"
              style="width:100%;font-size:24px;text-align:center;background:rgba(255,255,255,0.04);border:1px solid var(--admin-border);border-radius:8px;padding:10px;color:var(--admin-text);cursor:text"
              onchange="AgentPanel.save()" />
          </div>
          <div>
            <label class="conn-field-label">Persona Name</label>
            <input type="text" id="agent-persona" value="${esc(cfg.persona)}" placeholder="Aria"
              style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--admin-border);border-radius:8px;padding:10px 12px;color:var(--admin-text);font-size:14px"
              onchange="AgentPanel.save()" />
          </div>
        </div>
        <label class="conn-field-label">System Prompt</label>
        <textarea id="agent-system-prompt" rows="10"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.03);border:1px solid var(--admin-border);border-radius:8px;padding:12px;color:var(--admin-text);font-size:12.5px;font-family:monospace;resize:vertical;outline:none;line-height:1.6"
          onchange="AgentPanel.save()">${esc(cfg.systemPrompt)}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <div style="flex:1">
            <label class="conn-field-label">Temperature (${cfg.temperature})</label>
            <input type="range" id="agent-temperature" min="0" max="1" step="0.05" value="${cfg.temperature}"
              style="width:100%;cursor:pointer"
              oninput="document.getElementById('agent-temp-val').textContent=this.value" onchange="AgentPanel.save()" />
            <span id="agent-temp-val" style="font-size:11px;color:var(--admin-text-dim);font-family:monospace">${cfg.temperature}</span>
          </div>
          <div style="flex:1">
            <label class="conn-field-label">Max Tokens</label>
            <select id="agent-max-tokens"
              style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--admin-border);border-radius:8px;padding:9px 12px;color:var(--admin-text);font-size:13px"
              onchange="AgentPanel.save()">
              ${[2048,4096,8192,16384,32768].map(v =>
                `<option value="${v}" ${cfg.maxTokens===v?'selected':''}>${v.toLocaleString()} tokens</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="admin-btn" onclick="AgentPanel.save()">💾 Save Config</button>
          <button class="admin-btn" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.2);color:#f87171" onclick="AgentPanel.resetConfig()">↺ Reset to Defaults</button>
        </div>
      </div>
    </div>

    <!-- ── Tools tab ── -->
    <div class="agent-tab-panel" id="agent-tab-tools">
      <div class="admin-card" style="margin-top:12px">
        <div style="margin-bottom:14px;font-size:12px;color:var(--admin-text-dim)">
          Toggle which capabilities the agent can use. Tools marked (free) require no API key.
        </div>
        <div class="agent-tools-grid">
          ${toolRows.map(t => `
            <label class="agent-tool-row" title="${esc(t.desc)}">
              <span class="agent-tool-icon">${t.icon}</span>
              <span class="agent-tool-info">
                <span class="agent-tool-name">${t.label}</span>
                <span class="agent-tool-desc">${esc(t.desc)}</span>
              </span>
              <input type="checkbox" class="agent-tool-check" data-tool="${t.key}" ${cfg.tools[t.key]?'checked':''}
                onchange="AgentPanel.toggleTool('${t.key}', this.checked)" />
            </label>
          `).join('')}
        </div>

        <!-- Memory scope -->
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--admin-border)">
          <div class="conn-field-label" style="margin-bottom:8px">Cross-Session Memory Scope</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${['all','selected','none'].map(scope => `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
                <input type="radio" name="memory-scope" value="${scope}" ${cfg.memory.scope===scope?'checked':''}
                  onchange="AgentPanel.setMemoryScope('${scope}')" style="cursor:pointer" />
                ${{ all:'All sessions — agent memory available everywhere', selected:'Selected sessions only', none:'Disabled — no cross-session memory' }[scope]}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Knowledge Base tab ── -->
    <div class="agent-tab-panel" id="agent-tab-kb">
      <div class="admin-card" style="margin-top:12px">
        <!-- Upload area -->
        <div class="kb-upload-zone" id="kb-upload-zone">
          <input type="file" id="kb-file-input" multiple accept=".txt,.md,.json,.csv,.html,.js,.py,.ts,.yaml,.yml" style="display:none" />
          <div class="kb-upload-icon">📄</div>
          <div class="kb-upload-label">Drop files here or <a href="#" onclick="document.getElementById('kb-file-input').click();return false">click to upload</a></div>
          <div class="kb-upload-hint">TXT, MD, JSON, CSV, HTML, JS, PY, TS (max 5MB each)</div>
        </div>
        <!-- URL ingest -->
        <div style="display:flex;gap:8px;margin-top:12px">
          <input type="text" id="kb-url-input" placeholder="https://docs.example.com/page"
            style="flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--admin-border);border-radius:8px;padding:9px 12px;color:var(--admin-text);font-size:13px;outline:none" />
          <button class="admin-btn" onclick="AgentPanel.ingestUrl()">🔗 Ingest URL</button>
        </div>
        <!-- Document list -->
        <div style="margin-top:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div class="conn-field-label" style="margin:0">${docs.length} document${docs.length!==1?'s':''}</div>
            ${docs.length ? `<button class="admin-btn" style="font-size:11px;padding:4px 10px;background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.2);color:#f87171" onclick="AgentPanel.clearKb()">🗑 Clear All</button>` : ''}
          </div>
          ${docs.length === 0 ? `
            <div style="text-align:center;padding:24px;color:var(--admin-text-dim);font-size:13px">No documents yet. Upload files or ingest URLs above.</div>
          ` : `
            <div class="kb-doc-list">
              ${docs.map(d => `
                <div class="kb-doc-row" data-id="${esc(d.id)}">
                  <span class="kb-doc-icon">${{url:'🔗',pdf:'📕',txt:'📄',md:'📝',json:'📊',csv:'📈',html:'🌐'}[d.type]||'📄'}</span>
                  <div class="kb-doc-info">
                    <div class="kb-doc-title">${esc(d.title)}</div>
                    <div class="kb-doc-meta">${d.chunks?.length||0} chunks · ${d.type} · ${new Date(d.createdAt).toLocaleDateString()}
                      ${d.source?.startsWith('http') ? ` · <a href="${esc(d.source)}" target="_blank" style="color:#818cf8">source ↗</a>` : ''}
                    </div>
                  </div>
                  <button class="kb-doc-delete" onclick="AgentPanel.deleteKbDoc('${esc(d.id)}')" title="Remove document">✕</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <!-- KB settings -->
        <details style="margin-top:14px;font-size:12px;color:var(--admin-text-dim)">
          <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--admin-text)">⚙ KB Settings</summary>
          <div style="padding:10px 0;display:flex;gap:16px;flex-wrap:wrap">
            <label>Chunk size: <input type="number" id="kb-chunk-size" value="${cfg.knowledgeBase.chunkSize}" min="200" max="4000" step="100" style="width:72px;background:rgba(0,0,0,0.3);border:1px solid var(--admin-border);border-radius:6px;padding:4px 8px;color:var(--admin-text);font-size:12px" onchange="AgentPanel.saveKbSettings()" /></label>
            <label>Max chunks: <input type="number" id="kb-max-chunks" value="${cfg.knowledgeBase.maxChunks}" min="50" max="2000" step="50" style="width:72px;background:rgba(0,0,0,0.3);border:1px solid var(--admin-border);border-radius:6px;padding:4px 8px;color:var(--admin-text);font-size:12px" onchange="AgentPanel.saveKbSettings()" /></label>
            <label>Top-K results: <input type="number" id="kb-top-k" value="${cfg.knowledgeBase.topK}" min="1" max="20" style="width:60px;background:rgba(0,0,0,0.3);border:1px solid var(--admin-border);border-radius:6px;padding:4px 8px;color:var(--admin-text);font-size:12px" onchange="AgentPanel.saveKbSettings()" /></label>
          </div>
        </details>
      </div>
    </div>

    <!-- ── Memory tab ── -->
    <div class="agent-tab-panel" id="agent-tab-memory">
      <div class="admin-card" style="margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div style="font-size:13px;color:var(--admin-text-dim)">${mems.length} cross-session memor${mems.length!==1?'ies':'y'}</div>
          <div style="display:flex;gap:8px">
            <button class="admin-btn" style="font-size:11px;padding:5px 10px" onclick="AgentPanel.addMemory()">+ Add</button>
            ${mems.length ? `<button class="admin-btn" style="font-size:11px;padding:5px 10px;background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.2);color:#f87171" onclick="AgentPanel.clearMemory()">🗑 Clear All</button>` : ''}
          </div>
        </div>
        ${mems.length === 0 ? `
          <div style="text-align:center;padding:32px;color:var(--admin-text-dim);font-size:13px">
            <div style="font-size:28px;margin-bottom:8px">🧠</div>
            No agent memories yet. The AI will save memories automatically using the agent_memory_save tool.
          </div>
        ` : `
          <div class="memory-list">
            ${mems.map((m, i) => `
              <div class="memory-row">
                <div class="memory-row-main">
                  <div class="memory-row-key">${esc(m.key)}</div>
                  <div class="memory-row-value" id="agmem-val-${i}" contenteditable="true"
                    onblur="AgentPanel.updateMemory('${esc(m.key)}', this.textContent)"
                    style="cursor:text">${esc(m.value)}</div>
                  <div class="memory-row-meta">
                    ${m.timestamp ? `<span>${new Date(m.timestamp).toLocaleDateString()}</span>` : ''}
                    ${m.tags?.length ? ` · ${m.tags.map(t=>`<span>#${esc(t)}</span>`).join(' ')}` : ''}
                  </div>
                </div>
                <button class="memory-row-delete" onclick="AgentPanel.deleteMemory('${esc(m.key)}')">✕</button>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  // Wire file input
  const fileInput = document.getElementById('kb-file-input');
  const dropzone  = document.getElementById('kb-upload-zone');
  if (fileInput && dropzone) {
    fileInput.addEventListener('change', e => AgentPanel.handleFileUpload(e.target.files));
    dropzone.addEventListener('click', e => {
      if (e.target === dropzone || e.target.classList.contains('kb-upload-icon') || e.target.classList.contains('kb-upload-label')) {
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('kb-drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('kb-drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('kb-drag-over');
      AgentPanel.handleFileUpload(e.dataTransfer.files);
    });
  }
}

// ── AgentPanel controller (exposed globally for onclick handlers) ─────────────
window.AgentPanel = {

  async save() {
    const cfg = SuperAgent.config.get();
    cfg.persona      = document.getElementById('agent-persona')?.value.trim()   || cfg.persona;
    cfg.avatarEmoji  = document.getElementById('agent-avatar')?.value.trim()    || cfg.avatarEmoji;
    cfg.systemPrompt = document.getElementById('agent-system-prompt')?.value    || cfg.systemPrompt;
    cfg.temperature  = parseFloat(document.getElementById('agent-temperature')?.value ?? cfg.temperature);
    cfg.maxTokens    = parseInt(document.getElementById('agent-max-tokens')?.value   ?? cfg.maxTokens);
    SuperAgent.config.save(cfg);
    AdminApp?.toast?.('Agent config saved', 'success', 1500);
  },

  toggleEnabled(val) {
    const cfg = SuperAgent.config.get();
    cfg.enabled = val;
    SuperAgent.config.save(cfg);
    renderAgentPanel();
  },

  toggleTool(key, val) {
    const cfg = SuperAgent.config.get();
    cfg.tools[key] = val;
    SuperAgent.config.save(cfg);
  },

  setMemoryScope(scope) {
    const cfg = SuperAgent.config.get();
    cfg.memory.scope = scope;
    SuperAgent.config.save(cfg);
  },

  resetConfig() {
    if (!confirm('Reset all agent configuration to defaults?')) return;
    SuperAgent.config.reset();
    renderAgentPanel();
  },

  switchTab(tab, btn) {
    document.querySelectorAll('.agent-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.agent-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`agent-tab-${tab}`)?.classList.add('active');
  },

  async handleFileUpload(files) {
    if (!files?.length) return;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        AdminApp?.toast?.(`${file.name} is too large (max 5MB)`, 'error');
        continue;
      }
      try {
        AdminApp?.toast?.(`Ingesting ${file.name}…`, 'info', 2000);
        await SuperAgent.kb.ingestFile(file);
        AdminApp?.toast?.(`✅ ${file.name} ingested`, 'success', 2000);
      } catch (e) {
        AdminApp?.toast?.(`Failed: ${e.message}`, 'error');
      }
    }
    renderAgentPanel();
  },

  async ingestUrl() {
    const input = document.getElementById('kb-url-input');
    const url = input?.value?.trim();
    if (!url || !url.startsWith('http')) {
      AdminApp?.toast?.('Enter a valid URL starting with http', 'warning');
      return;
    }
    AdminApp?.toast?.('Ingesting URL…', 'info', 3000);
    try {
      const doc = await SuperAgent.kb.ingestUrl(url);
      AdminApp?.toast?.(`✅ Ingested: ${doc.title} (${doc.chunks.length} chunks)`, 'success');
      if (input) input.value = '';
      renderAgentPanel();
    } catch (e) {
      AdminApp?.toast?.(`Ingest failed: ${e.message}`, 'error');
    }
  },

  async deleteKbDoc(id) {
    await SuperAgent.kb.delete(id);
    renderAgentPanel();
  },

  async clearKb() {
    if (!confirm('Delete ALL knowledge base documents?')) return;
    await SuperAgent.kb.clear();
    renderAgentPanel();
  },

  saveKbSettings() {
    const cfg = SuperAgent.config.get();
    cfg.knowledgeBase.chunkSize = parseInt(document.getElementById('kb-chunk-size')?.value || cfg.knowledgeBase.chunkSize);
    cfg.knowledgeBase.maxChunks = parseInt(document.getElementById('kb-max-chunks')?.value || cfg.knowledgeBase.maxChunks);
    cfg.knowledgeBase.topK      = parseInt(document.getElementById('kb-top-k')?.value      || cfg.knowledgeBase.topK);
    SuperAgent.config.save(cfg);
    AdminApp?.toast?.('KB settings saved', 'success', 1200);
  },

  addMemory() {
    const key   = prompt('Memory key (short label):');
    const value = key ? prompt('Memory value:') : null;
    if (key && value) {
      SuperAgent.memory.add(key.trim(), value.trim());
      renderAgentPanel();
    }
  },

  updateMemory(key, newValue) {
    const val = (newValue || '').trim();
    if (!val) return;
    SuperAgent.memory.add(key, val);
    // No re-render to avoid disrupting focus
  },

  deleteMemory(key) {
    SuperAgent.memory.delete(key);
    renderAgentPanel();
  },

  clearMemory() {
    if (!confirm('Clear ALL agent memories? This cannot be undone.')) return;
    SuperAgent.memory.clear();
    renderAgentPanel();
  },
};
