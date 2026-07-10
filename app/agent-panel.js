/**
 * agent-panel.js — Super Admin Agent Panel (v2)
 * Renders #panel-agent in admin.html
 * Tabs: Config · Tools · Web Search · Knowledge Base · Memory · Integrations · Code & Calc
 */

'use strict';

// ── Helpers ──────────────────────────────────────────────────
function _escAP(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _ap_el(id) { return document.getElementById(id); }

// ── Render entry point (called by admin.js renderPanel) ──────
async function renderAgentPanel() {
  if (typeof SuperAgent === 'undefined') {
    const p = _ap_el('panel-agent');
    if (p) p.innerHTML = `<div style="padding:40px;text-align:center;color:var(--admin-text-dim)">⚠ SuperAgent not loaded. Ensure agent.js is loaded before agent-panel.js.</div>`;
    return;
  }

  const cfg  = SuperAgent.config.get();
  const mems = SuperAgent.memory.getAll();
  let   docs = [];
  try { docs = await SuperAgent.kb.listAll(); } catch {}

  const panel = _ap_el('panel-agent');
  if (!panel) return;

  panel.innerHTML = `
    <div class="admin-panel-header">
      <h2 class="admin-panel-title">
        <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${_escAP(cfg.avatarEmoji || '✦')} ${_escAP(cfg.persona || 'Aria')}</span>
      </h2>
      <p class="admin-panel-subtitle">Super-Admin AI Agent — configure capabilities, knowledge, memory, and integrations.</p>
    </div>

    <!-- Status bar -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;background:rgba(${cfg.enabled?'16,185,129':'239,68,68'},.08);border:1px solid rgba(${cfg.enabled?'16,185,129':'239,68,68'},.2);border-radius:20px;padding:6px 14px;font-size:12px">
        <span style="width:7px;height:7px;border-radius:50%;background:${cfg.enabled?'#10b981':'#ef4444'}"></span>
        ${cfg.enabled ? 'Agent Enabled' : 'Agent Disabled'}
        <button onclick="AgentPanel.toggleEnabled(${!cfg.enabled})" style="margin-left:6px;background:none;border:none;color:var(--admin-text-dim);cursor:pointer;font-size:11px;padding:0;font-family:inherit">${cfg.enabled ? 'Disable' : 'Enable'}</button>
      </div>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15);border-radius:20px;padding:6px 14px;font-size:12px;color:var(--admin-text-dim)">
        📚 ${docs.length} KB doc${docs.length!==1?'s':''}
      </div>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15);border-radius:20px;padding:6px 14px;font-size:12px;color:var(--admin-text-dim)">
        🧠 ${mems.length} memor${mems.length!==1?'ies':'y'}
      </div>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15);border-radius:20px;padding:6px 14px;font-size:12px;color:var(--admin-text-dim)">
        🔌 ${(cfg.apiIntegrations||[]).filter(i=>i.enabled).length} integration${(cfg.apiIntegrations||[]).filter(i=>i.enabled).length!==1?'s':''}
      </div>
      <a href="agent-chat.html" style="display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1));border:1px solid rgba(99,102,241,.3);border-radius:20px;padding:6px 14px;font-size:12px;color:#818cf8;text-decoration:none;margin-left:auto">
        ✦ Open Aria Chat ↗
      </a>
    </div>

    <!-- Tab bar -->
    <div class="agent-tab-bar" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--admin-border);padding-bottom:8px">
      ${['config','tools','websearch','kb','memory','integrations','code'].map((t,i) => `
        <button class="agent-tab${i===0?' active':''}" onclick="AgentPanel.switchTab('${t}',this)" style="padding:7px 14px;font-size:12px;font-weight:500;border-radius:8px 8px 0 0;border:none;cursor:pointer;font-family:inherit;background:${i===0?'var(--admin-card-bg)':'transparent'};color:${i===0?'#818cf8':'var(--admin-text-dim)'};border-bottom:${i===0?'2px solid #6366f1':'2px solid transparent'};transition:all .15s">
          ${{config:'⚙ Config',tools:'🔧 Tools',websearch:'🔍 Web Search',kb:'📚 Knowledge Base',memory:'🧠 Memory',integrations:'🔌 Integrations',code:'🧮 Code & Calc'}[t]}
        </button>
      `).join('')}
    </div>

    <!-- ── CONFIG TAB ─────────────────────────────────────── -->
    <div class="agent-tab-panel active" id="agent-tab-config">
      <div class="admin-card">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Persona Name</label>
            <input id="agent-persona" type="text" value="${_escAP(cfg.persona)}" class="admin-input" style="width:100%" placeholder="Aria" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Avatar Emoji</label>
            <input id="agent-avatar" type="text" value="${_escAP(cfg.avatarEmoji)}" class="admin-input" style="width:100%" placeholder="✦" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Temperature <span style="color:var(--admin-text-dim)">(0–1)</span></label>
            <input id="agent-temperature" type="number" min="0" max="1" step="0.05" value="${cfg.temperature}" class="admin-input" style="width:100%" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Max Tokens</label>
            <input id="agent-max-tokens" type="number" min="512" max="32000" step="256" value="${cfg.maxTokens}" class="admin-input" style="width:100%" />
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">System Prompt</label>
          <textarea id="agent-system-prompt" class="admin-input" rows="8" style="width:100%;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;resize:vertical;line-height:1.6">${_escAP(cfg.systemPrompt)}</textarea>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Memory Scope</label>
          <select id="agent-mem-scope" class="admin-input" style="width:100%" onchange="AgentPanel.setMemoryScope(this.value)">
            <option value="all"      ${cfg.memory?.scope==='all'      ?'selected':''}>All sessions — Aria remembers across every conversation</option>
            <option value="none"     ${cfg.memory?.scope==='none'     ?'selected':''}>Disabled — no cross-session memory</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="admin-btn admin-btn-primary" onclick="AgentPanel.save()">💾 Save Config</button>
          <button class="admin-btn" onclick="AgentPanel.resetConfig()" style="background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.2);color:#f87171">↺ Reset Defaults</button>
        </div>
      </div>
    </div>

    <!-- ── TOOLS TAB ──────────────────────────────────────── -->
    <div class="agent-tab-panel" id="agent-tab-tools">
      <div class="admin-card">
        <p style="font-size:12px;color:var(--admin-text-dim);margin-bottom:16px">Enable or disable individual tools available to Aria. Changes take effect immediately for new messages.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${[
            {k:'webSearch',      i:'🔍', l:'Web Search',              d:'Live internet search (Brave/SerpAPI/DDG)'},
            {k:'wikipedia',      i:'📖', l:'Wikipedia',               d:'Authoritative reference lookups'},
            {k:'weather',        i:'🌤', l:'Live Weather',            d:'Current conditions anywhere in the world'},
            {k:'githubSearch',   i:'🐙', l:'GitHub Search',           d:'Repos, code, and developers'},
            {k:'news',           i:'📰', l:'News Headlines',          d:'Latest articles on any topic'},
            {k:'knowledgeBase',  i:'📚', l:'Knowledge Base Search',   d:'Search your uploaded documents'},
            {k:'crossMemory',    i:'🧠', l:'Cross-Session Memory',    d:'Remember facts across all sessions'},
            {k:'calculator',     i:'🧮', l:'Calculator',              d:'Math expressions and formulas'},
            {k:'codeRunner',     i:'⚙', l:'Code Runner',             d:'Sandboxed JS execution (advanced)'},
            {k:'createNote',     i:'📝', l:'Create Note',             d:'Save notes directly to KB from chat'},
            {k:'listKbDocs',     i:'📋', l:'List KB Docs',            d:'See all KB documents from chat'},
            {k:'apiIntegrations',i:'🔌', l:'API Integrations',        d:'Call configured REST integrations'},
          ].map(t => `
            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,255,255,.02);border:1px solid var(--admin-border);border-radius:10px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='rgba(99,102,241,.3)'" onmouseout="this.style.borderColor='var(--admin-border)'">
              <input type="checkbox" ${cfg.tools[t.k]?'checked':''} onchange="AgentPanel.toggleTool('${t.k}',this.checked)" style="margin-top:2px;accent-color:#6366f1;width:14px;height:14px;flex-shrink:0" />
              <div>
                <div style="font-size:12px;font-weight:500">${t.i} ${_escAP(t.l)}</div>
                <div style="font-size:11px;color:var(--admin-text-dim);margin-top:2px">${_escAP(t.d)}</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- ── WEB SEARCH TAB ─────────────────────────────────── -->
    <div class="agent-tab-panel" id="agent-tab-websearch">
      <div class="admin-card">
        <h3 style="font-size:13px;font-weight:600;margin-bottom:12px">🔍 Web Search Provider</h3>
        <p style="font-size:12px;color:var(--admin-text-dim);margin-bottom:16px">
          Aria can search the live internet for current information. Choose a provider below.
          DuckDuckGo works without an API key (instant answers only). Brave and SerpAPI provide full web results.
        </p>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
          ${[
            {id:'ddg',  name:'DuckDuckGo', free:true,  limit:'No key needed',    desc:'Instant answers & related topics. No signup required.'},
            {id:'brave',name:'Brave Search',free:false, limit:'2,000/mo free',    desc:'Full web results. Best quality. Free tier available.'},
            {id:'serp', name:'SerpAPI',    free:false,  limit:'100/mo free',     desc:'Google results via SerpAPI. Most accurate.'},
          ].map(p => `
            <label style="display:flex;flex-direction:column;gap:6px;padding:14px;border:2px solid ${(cfg.webSearch?.provider||'ddg')===p.id?'#6366f1':'var(--admin-border)'};border-radius:12px;cursor:pointer;background:${(cfg.webSearch?.provider||'ddg')===p.id?'rgba(99,102,241,.08)':'transparent'};transition:all .15s">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="radio" name="ws-provider" value="${p.id}" ${(cfg.webSearch?.provider||'ddg')===p.id?'checked':''} onchange="AgentPanel.setWebSearchProvider('${p.id}')" style="accent-color:#6366f1" />
                <span style="font-size:13px;font-weight:600">${_escAP(p.name)}</span>
                ${p.free?'<span style="font-size:10px;background:rgba(16,185,129,.1);color:#10b981;border-radius:20px;padding:1px 6px;border:1px solid rgba(16,185,129,.2)">Free</span>':''}
              </div>
              <span style="font-size:11px;color:var(--admin-text-dim)">${_escAP(p.desc)}</span>
              <span style="font-size:10px;color:var(--admin-text-dim);font-style:italic">${_escAP(p.limit)}</span>
            </label>
          `).join('')}
        </div>

        <div id="ws-key-section" style="${(cfg.webSearch?.provider||'ddg')==='ddg'?'display:none':''}">
          <div style="margin-bottom:12px">
            <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">API Key</label>
            <div style="display:flex;gap:8px">
              <input id="ws-api-key" type="password" class="admin-input" style="flex:1" value="${_escAP(cfg.webSearch?.apiKey||'')}" placeholder="Paste your API key here…" />
              <button class="admin-btn" onclick="AgentPanel.toggleWsKeyViz()" style="padding:0 10px">👁</button>
            </div>
            <div style="font-size:11px;color:var(--admin-text-dim);margin-top:4px">
              ${(cfg.webSearch?.provider||'ddg')==='brave'
                ? 'Get a free key at <strong>api.search.brave.com</strong>'
                : 'Get a key at <strong>serpapi.com</strong>'}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="admin-btn admin-btn-primary" onclick="AgentPanel.saveWebSearch()">💾 Save</button>
          <button class="admin-btn" onclick="AgentPanel.testWebSearch()">🧪 Test Search</button>
        </div>

        <div id="ws-test-result" style="display:none;background:rgba(0,0,0,.3);border:1px solid var(--admin-border);border-radius:10px;padding:12px;font-size:12px;color:var(--admin-text-dim);font-family:'JetBrains Mono',monospace;line-height:1.6;white-space:pre-wrap;max-height:300px;overflow-y:auto"></div>

        <details style="margin-top:16px">
          <summary style="font-size:12px;color:var(--admin-text-dim);cursor:pointer">Max results per search</summary>
          <div style="margin-top:10px">
            <input type="number" id="ws-max-results" value="${cfg.webSearch?.maxResults||5}" min="1" max="10" class="admin-input" style="width:80px" />
            <button class="admin-btn" style="margin-left:8px" onclick="AgentPanel.saveWebSearch()">Save</button>
          </div>
        </details>
      </div>
    </div>

    <!-- ── KNOWLEDGE BASE TAB ─────────────────────────────── -->
    <div class="agent-tab-panel" id="agent-tab-kb">
      <div class="admin-card" style="margin-bottom:12px">
        <h3 style="font-size:13px;font-weight:600;margin-bottom:12px">📤 Add Documents</h3>

        <!-- File upload -->
        <div id="kb-upload-zone" style="border:2px dashed rgba(99,102,241,.3);border-radius:12px;padding:28px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:12px" onmouseover="this.style.borderColor='rgba(99,102,241,.6)'" onmouseout="this.style.borderColor='rgba(99,102,241,.3)'">
          <div style="font-size:28px;margin-bottom:8px">📄</div>
          <div style="font-size:13px;font-weight:500;margin-bottom:4px">Drop files here or click to upload</div>
          <div style="font-size:11px;color:var(--admin-text-dim)">TXT, MD, JSON, CSV, JS, PY, HTML, PDF — up to 20MB each</div>
          <input type="file" id="kb-file-input" multiple accept=".txt,.md,.json,.csv,.js,.py,.ts,.html,.css,.xml,.yaml,.yml,.pdf" style="display:none" />
        </div>

        <!-- URL ingest -->
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:8px">
          <input type="url" id="kb-url-input" class="admin-input" placeholder="https://example.com/docs — ingest a webpage" />
          <button class="admin-btn admin-btn-primary" onclick="AgentPanel.ingestUrl()" style="white-space:nowrap">+ Ingest URL</button>
        </div>

        <!-- Batch URL ingest -->
        <details style="margin-bottom:8px">
          <summary style="font-size:12px;color:var(--admin-text-dim);cursor:pointer">Batch URL ingest (multiple URLs)</summary>
          <div style="margin-top:8px">
            <textarea id="kb-batch-urls" class="admin-input" rows="4" style="width:100%;font-size:12px;font-family:monospace" placeholder="https://url1.com&#10;https://url2.com&#10;https://url3.com"></textarea>
            <button class="admin-btn" style="margin-top:6px" onclick="AgentPanel.batchIngestUrls()">Ingest All URLs</button>
          </div>
        </details>

        <!-- Category/tags for upload -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input type="text" id="kb-category" class="admin-input" placeholder="Category (e.g. research, work, personal)" />
          <input type="text" id="kb-tags" class="admin-input" placeholder="Tags: comma, separated" />
        </div>

        <!-- Search KB -->
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
          <input type="search" id="kb-search-input" class="admin-input" placeholder="🔍 Search knowledge base…" oninput="AgentPanel.liveKbSearch(this.value)" />
          <button class="admin-btn" onclick="AgentPanel.liveKbSearch(_ap_el('kb-search-input')?.value||'')">Search</button>
        </div>
        <div id="kb-search-results" style="display:none;margin-top:8px;background:rgba(0,0,0,.25);border:1px solid var(--admin-border);border-radius:10px;padding:10px;font-size:12px;max-height:200px;overflow-y:auto"></div>
      </div>

      <!-- Document list -->
      <div class="admin-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div style="font-size:13px;font-weight:500">${docs.length} document${docs.length!==1?'s':''} in knowledge base</div>
          <div style="display:flex;gap:8px">
            <select id="kb-filter-cat" class="admin-input" style="font-size:12px;padding:5px 8px" onchange="AgentPanel.filterKbDocs(this.value)">
              <option value="">All categories</option>
              ${[...new Set(docs.map(d=>d.category||'general'))].map(c=>`<option value="${_escAP(c)}">${_escAP(c)}</option>`).join('')}
            </select>
            ${docs.length?`<button class="admin-btn" style="font-size:11px;padding:5px 10px;background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.2);color:#f87171" onclick="AgentPanel.clearKb()">🗑 Clear All</button>`:''}
          </div>
        </div>

        ${!docs.length ? `
          <div style="text-align:center;padding:40px;color:var(--admin-text-dim)">
            <div style="font-size:36px;margin-bottom:10px">📭</div>
            <div style="font-size:13px">Knowledge base is empty.</div>
            <div style="font-size:12px;margin-top:4px">Upload documents or ingest URLs above to give Aria specialized knowledge.</div>
          </div>
        ` : `
          <div id="kb-doc-list">
            ${docs.map(d => `
              <div class="kb-doc-row" data-cat="${_escAP(d.category||'general')}" style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--admin-border)">
                <div style="font-size:20px;flex-shrink:0">
                  ${{note:'📝',url:'🌐',pdf:'📕',file:'📄',txt:'📃',md:'📋',json:'📦',csv:'📊'}[d.type||'file']||'📄'}
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escAP(d.title)}</div>
                  <div style="font-size:11px;color:var(--admin-text-dim);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap">
                    <span>${d.chunks?.length||0} chunk${(d.chunks?.length||0)!==1?'s':''}</span>
                    <span>·</span>
                    <span>${_escAP(d.category||'general')}</span>
                    ${d.tags?.length?`<span>·</span><span>#${d.tags.join(' #')}</span>`:''}
                    ${d.createdAt?`<span>·</span><span>${new Date(d.createdAt).toLocaleDateString()}</span>`:''}
                    ${d.source&&d.source!=='file'&&d.source!=='agent-created'?`<span>·</span><a href="${_escAP(d.source)}" target="_blank" style="color:#818cf8;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block">${_escAP(d.source)}</a>`:''}
                  </div>
                </div>
                <button onclick="AgentPanel.deleteKbDoc('${_escAP(d.id)}')" title="Delete" style="border:none;background:rgba(239,68,68,.08);color:#f87171;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;flex-shrink:0">✕</button>
              </div>
            `).join('')}
          </div>
        `}

        <details style="margin-top:16px">
          <summary style="font-size:12px;color:var(--admin-text-dim);cursor:pointer">⚙ KB Settings</summary>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center">
            <label style="font-size:12px">Chunk size: <input type="number" id="kb-chunk-size" value="${cfg.knowledgeBase.chunkSize}" min="200" max="2000" step="100" class="admin-input" style="width:72px" onchange="AgentPanel.saveKbSettings()" /></label>
            <label style="font-size:12px">Max chunks: <input type="number" id="kb-max-chunks" value="${cfg.knowledgeBase.maxChunks}" min="50" max="2000" step="50" class="admin-input" style="width:72px" onchange="AgentPanel.saveKbSettings()" /></label>
            <label style="font-size:12px">Top-K: <input type="number" id="kb-top-k" value="${cfg.knowledgeBase.topK}" min="1" max="20" class="admin-input" style="width:60px" onchange="AgentPanel.saveKbSettings()" /></label>
          </div>
        </details>
      </div>
    </div>

    <!-- ── MEMORY TAB ──────────────────────────────────────── -->
    <div class="agent-tab-panel" id="agent-tab-memory">
      <div class="admin-card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          <div style="font-size:13px;font-weight:500">🧠 ${mems.length} memor${mems.length!==1?'ies':'y'}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="admin-btn" style="font-size:11px;padding:5px 10px" onclick="AgentPanel.showAddMemory()">+ Add</button>
            <button class="admin-btn" style="font-size:11px;padding:5px 10px" onclick="AgentPanel.exportMemory()">↓ Export</button>
            <button class="admin-btn" style="font-size:11px;padding:5px 10px" onclick="AgentPanel.importMemory()">↑ Import</button>
            ${mems.length?`<button class="admin-btn" style="font-size:11px;padding:5px 10px;background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);color:#f87171" onclick="AgentPanel.clearMemory()">🗑 Clear All</button>`:''}
          </div>
        </div>

        <!-- Quick add form -->
        <div id="mem-add-form" style="display:none;background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:14px;margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:10px;color:#818cf8">➕ Teach Aria</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <input type="text" id="mem-new-key" class="admin-input" placeholder="Label (e.g. 'My timezone')" />
            <select id="mem-new-cat" class="admin-input">
              <option value="preferences">Preferences</option>
              <option value="projects">Projects</option>
              <option value="contacts">Contacts</option>
              <option value="dates">Dates</option>
              <option value="general" selected>General</option>
            </select>
          </div>
          <div style="margin-bottom:8px">
            <input type="text" id="mem-new-val" class="admin-input" style="width:100%" placeholder="Value (e.g. 'America/Chicago — UTC-6')" />
          </div>
          <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px">
            <input type="text" id="mem-new-tags" class="admin-input" placeholder="Tags (comma separated)" />
            <button class="admin-btn admin-btn-primary" onclick="AgentPanel.saveNewMemory()">Save</button>
            <button class="admin-btn" onclick="AgentPanel.hideAddMemory()">Cancel</button>
          </div>
        </div>

        <!-- Category filter tabs -->
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">
          ${['All','Preferences','Projects','Contacts','Dates','General'].map((cat,i) => `
            <button class="mem-cat-btn${i===0?' active':''}" onclick="AgentPanel.filterMemory('${cat.toLowerCase()}',this)" style="padding:4px 12px;font-size:11px;border-radius:20px;border:1px solid ${i===0?'rgba(99,102,241,.4)':'var(--admin-border)'};background:${i===0?'rgba(99,102,241,.1)':'transparent'};color:${i===0?'#818cf8':'var(--admin-text-dim)'};cursor:pointer;transition:all .15s;font-family:inherit">
              ${_escAP(cat)} <span class="mem-count-${cat.toLowerCase()}">(${i===0?mems.length:mems.filter(m=>(m.category||'general')===cat.toLowerCase()).length})</span>
            </button>
          `).join('')}
        </div>

        <!-- Search -->
        <input type="search" id="mem-search" class="admin-input" style="width:100%;margin-bottom:12px" placeholder="🔍 Search memories…"
          oninput="document.querySelectorAll('.mem-row').forEach(r=>{r.style.display=(r.dataset.text||'').toLowerCase().includes(this.value.toLowerCase())?'':'none'})" />

        <!-- Memory list -->
        ${!mems.length ? `
          <div style="text-align:center;padding:32px;color:var(--admin-text-dim)">
            <div style="font-size:32px;margin-bottom:8px">🧠</div>
            No memories yet. Aria will save them automatically, or click + Add to teach her manually.
          </div>
        ` : `
          <div class="memory-list" id="mem-list">
            ${mems.map((m,i) => `
              <div class="memory-row mem-row" data-cat="${_escAP(m.category||'general')}" data-text="${_escAP((m.key||'')+' '+(m.value||'')+' '+(m.category||''))}" style="animation:none">
                <div class="memory-row-main">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                    <div class="memory-row-key">${_escAP(m.key||'fact')}</div>
                    <span style="font-size:10px;background:rgba(99,102,241,.1);color:#818cf8;border-radius:10px;padding:1px 6px;border:1px solid rgba(99,102,241,.2)">${_escAP(m.category||'general')}</span>
                    ${m.tags?.length?m.tags.map(t=>`<span style="font-size:10px;color:var(--admin-text-dim)">#${_escAP(t)}</span>`).join(''):''}
                  </div>
                  <div class="memory-row-value" id="agmem-val-${i}" contenteditable="true"
                    onblur="AgentPanel.updateMemory('${_escAP(m.key)}', this.textContent)"
                    style="cursor:text">${_escAP(m.value)}</div>
                  <div class="memory-row-meta">
                    ${m.timestamp?`<span>${new Date(m.timestamp).toLocaleDateString()}</span>`:''}
                  </div>
                </div>
                <button class="memory-row-delete" onclick="AgentPanel.deleteMemory('${_escAP(m.key)}')">✕</button>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>

    <!-- ── INTEGRATIONS TAB ────────────────────────────────── -->
    <div class="agent-tab-panel" id="agent-tab-integrations">
      <div class="admin-card" style="margin-bottom:12px">
        <h3 style="font-size:13px;font-weight:600;margin-bottom:8px">🔌 Add API Integration</h3>
        <p style="font-size:12px;color:var(--admin-text-dim);margin-bottom:14px">
          Add any REST API so Aria can call it on demand via the <code style="font-size:11px;background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px">call_integration</code> tool.
          Examples: Notion, Airtable, Slack, custom backend, CRM, database API.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input type="text"  id="int-name"     class="admin-input" placeholder="Name (e.g. My Notion)" />
          <input type="url"   id="int-endpoint" class="admin-input" placeholder="Base URL (e.g. https://api.notion.com/v1)" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input type="password" id="int-key"    class="admin-input" placeholder="API Key (optional)" />
          <select id="int-auth" class="admin-input">
            <option value="bearer">Bearer token (Authorization: Bearer …)</option>
            <option value="key">X-API-Key header</option>
            <option value="basic">Basic auth (base64 encoded)</option>
            <option value="query">Query param (?api_key=…)</option>
            <option value="none">No auth</option>
          </select>
        </div>
        <input type="text" id="int-desc" class="admin-input" style="width:100%;margin-bottom:8px" placeholder="Description (e.g. 'My team task manager — use for project updates')" />
        <button class="admin-btn admin-btn-primary" onclick="AgentPanel.addIntegration()">+ Add Integration</button>
      </div>

      <!-- Integration list -->
      <div class="admin-card">
        <div style="font-size:13px;font-weight:500;margin-bottom:12px">Configured Integrations <span style="color:var(--admin-text-dim)">(${(cfg.apiIntegrations||[]).length})</span></div>
        ${!(cfg.apiIntegrations||[]).length ? `
          <div style="text-align:center;padding:32px;color:var(--admin-text-dim)">
            <div style="font-size:32px;margin-bottom:8px">🔌</div>
            No integrations yet. Add a REST API above to let Aria call external services.
          </div>
        ` : (cfg.apiIntegrations||[]).map((integ,i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--admin-border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px">
                ${_escAP(integ.name)}
                <span style="font-size:10px;background:rgba(${integ.enabled?'16,185,129':'239,68,68'},.1);color:${integ.enabled?'#10b981':'#f87171'};border-radius:20px;padding:1px 6px;border:1px solid rgba(${integ.enabled?'16,185,129':'239,68,68'},.2)">${integ.enabled?'Enabled':'Disabled'}</span>
              </div>
              <div style="font-size:11px;color:var(--admin-text-dim);margin-top:2px">${_escAP(integ.endpoint)}</div>
              ${integ.description?`<div style="font-size:11px;color:var(--admin-text-dim);margin-top:2px;font-style:italic">${_escAP(integ.description)}</div>`:''}
              ${integ.lastUsed?`<div style="font-size:10px;color:var(--admin-text-dim);margin-top:2px">Last used: ${new Date(integ.lastUsed).toLocaleString()}</div>`:''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button onclick="AgentPanel.testIntegration('${_escAP(integ.id)}')" class="admin-btn" style="font-size:11px;padding:4px 8px">🧪 Test</button>
              <button onclick="AgentPanel.toggleIntegration('${_escAP(integ.id)}')" class="admin-btn" style="font-size:11px;padding:4px 8px">${integ.enabled?'Disable':'Enable'}</button>
              <button onclick="AgentPanel.deleteIntegration('${_escAP(integ.id)}')" class="admin-btn" style="font-size:11px;padding:4px 8px;background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.2);color:#f87171">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- ── CODE & CALC TAB ────────────────────────────────── -->
    <div class="agent-tab-panel" id="agent-tab-code">
      <div class="admin-card" style="margin-bottom:12px">
        <h3 style="font-size:13px;font-weight:600;margin-bottom:12px">🧮 Calculator</h3>
        <p style="font-size:12px;color:var(--admin-text-dim);margin-bottom:14px">
          Aria can evaluate math expressions using the <code style="font-size:11px;background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px">calculate</code> tool.
          Supports arithmetic, exponents, trigonometry, and all <code>Math.*</code> functions.
        </p>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:16px;cursor:pointer">
          <input type="checkbox" ${cfg.tools.calculator?'checked':''} onchange="AgentPanel.toggleTool('calculator',this.checked)" style="accent-color:#6366f1;width:15px;height:15px" />
          <span style="font-size:13px">Enable Calculator tool</span>
        </label>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Test Expression</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="calc-test" class="admin-input" style="flex:1;font-family:monospace" placeholder="e.g. 2**32, Math.sqrt(144), 1000*(1+0.07)**10" />
            <button class="admin-btn" onclick="AgentPanel.testCalc()">Calculate</button>
          </div>
          <div id="calc-result" style="margin-top:8px;display:none;font-family:'JetBrains Mono',monospace;font-size:13px;color:#10b981;background:rgba(16,185,129,.05);border:1px solid rgba(16,185,129,.15);border-radius:8px;padding:8px 12px"></div>
        </div>
        <div style="background:rgba(0,0,0,.2);border-radius:10px;padding:12px;font-size:11px;color:var(--admin-text-dim)">
          <div style="font-weight:600;margin-bottom:6px">Example expressions:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${['2**32','Math.sqrt(144)','Math.PI * 10**2','1000*(1+0.07)**10','Math.log(1000)/Math.log(10)','Math.sin(Math.PI/6)'].map(e =>
              `<code onclick="_ap_el('calc-test').value='${e}'" style="cursor:pointer;background:rgba(255,255,255,.06);border:1px solid var(--admin-border);border-radius:4px;padding:2px 6px;font-size:11px">${e}</code>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="admin-card">
        <h3 style="font-size:13px;font-weight:600;margin-bottom:12px">⚙ Code Runner</h3>
        <div style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--admin-text-dim)">
          ⚠ Runs JavaScript in a sandboxed Web Worker. Code cannot access the DOM, network, or localStorage — only computation. Use <code>console.log()</code> to return results.
        </div>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:16px;cursor:pointer">
          <input type="checkbox" ${cfg.tools.codeRunner?'checked':''} onchange="AgentPanel.toggleTool('codeRunner',this.checked)" style="accent-color:#6366f1;width:15px;height:15px" />
          <span style="font-size:13px">Enable Code Runner tool (Aria can execute JS snippets)</span>
        </label>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--admin-text-dim);display:block;margin-bottom:5px">Test Snippet</label>
          <textarea id="code-test" class="admin-input" rows="5" style="width:100%;font-family:'JetBrains Mono',monospace;font-size:12px;resize:vertical" placeholder="const data = [1,2,3,4,5];&#10;const avg = data.reduce((a,b)=>a+b,0)/data.length;&#10;console.log('Average:', avg)"></textarea>
          <button class="admin-btn" style="margin-top:8px" onclick="AgentPanel.testCode()">▶ Run</button>
          <div id="code-result" style="margin-top:8px;display:none;font-family:'JetBrains Mono',monospace;font-size:12px;background:rgba(0,0,0,.4);border:1px solid var(--admin-border);border-radius:8px;padding:10px;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>
        </div>
      </div>
    </div>
  `;

  // Wire file input and drop zone
  const fileInput = _ap_el('kb-file-input');
  const dropzone  = _ap_el('kb-upload-zone');
  if (fileInput && dropzone) {
    fileInput.addEventListener('change', e => AgentPanel.handleFileUpload(e.target.files));
    dropzone.addEventListener('click', e => {
      if (!e.target.matches('button,input,select,a')) fileInput.click();
    });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor='rgba(99,102,241,.8)'; dropzone.style.background='rgba(99,102,241,.06)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor='rgba(99,102,241,.3)'; dropzone.style.background=''; });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.style.borderColor='rgba(99,102,241,.3)';
      dropzone.style.background='';
      AgentPanel.handleFileUpload(e.dataTransfer.files);
    });
  }
}

// ── AgentPanel controller ────────────────────────────────────
window.AgentPanel = {

  // ── Config ────────────────────────────────────────────────
  async save() {
    const cfg = SuperAgent.config.get();
    cfg.persona      = _ap_el('agent-persona')?.value.trim()  || cfg.persona;
    cfg.avatarEmoji  = _ap_el('agent-avatar')?.value.trim()   || cfg.avatarEmoji;
    cfg.systemPrompt = _ap_el('agent-system-prompt')?.value   || cfg.systemPrompt;
    cfg.temperature  = parseFloat(_ap_el('agent-temperature')?.value ?? cfg.temperature);
    cfg.maxTokens    = parseInt(_ap_el('agent-max-tokens')?.value   ?? cfg.maxTokens);
    SuperAgent.config.save(cfg);
    AdminApp?.toast?.('Agent config saved ✓', 'success', 1500);
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
    AdminApp?.toast?.(`${val?'Enabled':'Disabled'} ${key}`, 'success', 1000);
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
    document.querySelectorAll('.agent-tab').forEach(b => {
      b.classList.remove('active');
      b.style.background     = 'transparent';
      b.style.color          = 'var(--admin-text-dim)';
      b.style.borderBottom   = '2px solid transparent';
    });
    document.querySelectorAll('.agent-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.style.background   = 'var(--admin-card-bg)';
    btn.style.color        = '#818cf8';
    btn.style.borderBottom = '2px solid #6366f1';
    _ap_el(`agent-tab-${tab}`)?.classList.add('active');
  },

  // ── Web search ─────────────────────────────────────────────
  setWebSearchProvider(prov) {
    const sec = _ap_el('ws-key-section');
    if (sec) sec.style.display = prov === 'ddg' ? 'none' : '';
    const cfg = SuperAgent.config.get();
    cfg.webSearch = { ...(cfg.webSearch || {}), provider: prov };
    SuperAgent.config.save(cfg);
  },

  saveWebSearch() {
    const cfg = SuperAgent.config.get();
    const prov = document.querySelector('input[name="ws-provider"]:checked')?.value || cfg.webSearch?.provider || 'ddg';
    cfg.webSearch = {
      provider:   prov,
      apiKey:     _ap_el('ws-api-key')?.value?.trim() || '',
      maxResults: parseInt(_ap_el('ws-max-results')?.value || '5'),
    };
    SuperAgent.config.save(cfg);
    AdminApp?.toast?.('Web search settings saved ✓', 'success', 1500);
  },

  toggleWsKeyViz() {
    const inp = _ap_el('ws-api-key');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  },

  async testWebSearch() {
    this.saveWebSearch();
    const res = _ap_el('ws-test-result');
    if (!res) return;
    res.style.display = 'block';
    res.textContent = 'Searching…';
    try {
      const r = await SuperAgent.executeSuperTool('web_search', { query: 'latest AI news today', maxResults: 3 });
      res.textContent = r || '(no result)';
    } catch (e) {
      res.textContent = 'Error: ' + e.message;
    }
  },

  // ── Knowledge Base ──────────────────────────────────────────
  async handleFileUpload(files) {
    if (!files?.length) return;
    const cat  = _ap_el('kb-category')?.value?.trim() || 'general';
    const tags = (_ap_el('kb-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    for (const file of files) {
      try {
        AdminApp?.toast?.(`Ingesting ${file.name}…`, 'info', 2000);
        await SuperAgent.kb.ingestFile(file, cat, tags);
        AdminApp?.toast?.(`✅ ${file.name} ingested`, 'success', 2000);
      } catch (e) {
        AdminApp?.toast?.(`Failed: ${e.message}`, 'error');
      }
    }
    renderAgentPanel();
  },

  async ingestUrl() {
    const input = _ap_el('kb-url-input');
    const url   = input?.value?.trim();
    if (!url?.startsWith('http')) { AdminApp?.toast?.('Enter a valid URL starting with http', 'warning'); return; }
    const cat  = _ap_el('kb-category')?.value?.trim() || 'general';
    const tags = (_ap_el('kb-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    AdminApp?.toast?.('Ingesting URL…', 'info', 4000);
    try {
      const doc = await SuperAgent.kb.ingestUrl(url, cat, tags);
      AdminApp?.toast?.(`✅ ${doc.title} (${doc.chunks.length} chunks)`, 'success');
      if (input) input.value = '';
      renderAgentPanel();
    } catch (e) { AdminApp?.toast?.(`Ingest failed: ${e.message}`, 'error'); }
  },

  async batchIngestUrls() {
    const ta   = _ap_el('kb-batch-urls');
    const urls = (ta?.value || '').split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (!urls.length) { AdminApp?.toast?.('No valid URLs found', 'warning'); return; }
    const cat  = _ap_el('kb-category')?.value?.trim() || 'general';
    const tags = (_ap_el('kb-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    AdminApp?.toast?.(`Ingesting ${urls.length} URLs…`, 'info', 4000);
    let ok = 0, fail = 0;
    for (const url of urls) {
      try { await SuperAgent.kb.ingestUrl(url, cat, tags); ok++; }
      catch { fail++; }
    }
    AdminApp?.toast?.(`✅ ${ok} ingested${fail ? `, ${fail} failed` : ''}`, ok ? 'success' : 'error');
    if (ta) ta.value = '';
    renderAgentPanel();
  },

  async liveKbSearch(query) {
    const el = _ap_el('kb-search-results');
    if (!el) return;
    if (!query?.trim()) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = 'Searching…';
    try {
      const results = await SuperAgent.kb.search(query.trim(), 5);
      if (!results.length) { el.textContent = 'No results.'; return; }
      el.innerHTML = results.map(r =>
        `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--admin-border)">
          <div style="font-size:11px;font-weight:600;color:#818cf8">${_escAP(r.doc.title)}</div>
          <div style="font-size:11px;color:var(--admin-text-dim);margin-top:2px">${_escAP(r.chunk.text.slice(0,160))}…</div>
        </div>`
      ).join('');
    } catch (e) { el.textContent = 'Search error: ' + e.message; }
  },

  filterKbDocs(cat) {
    document.querySelectorAll('.kb-doc-row').forEach(el => {
      el.style.display = !cat || el.dataset.cat === cat ? '' : 'none';
    });
  },

  async deleteKbDoc(id) {
    await SuperAgent.kb.delete(id);
    renderAgentPanel();
  },

  async clearKb() {
    if (!confirm('Delete ALL knowledge base documents? This cannot be undone.')) return;
    await SuperAgent.kb.clear();
    renderAgentPanel();
  },

  saveKbSettings() {
    const cfg = SuperAgent.config.get();
    cfg.knowledgeBase.chunkSize = parseInt(_ap_el('kb-chunk-size')?.value  || cfg.knowledgeBase.chunkSize);
    cfg.knowledgeBase.maxChunks = parseInt(_ap_el('kb-max-chunks')?.value  || cfg.knowledgeBase.maxChunks);
    cfg.knowledgeBase.topK      = parseInt(_ap_el('kb-top-k')?.value       || cfg.knowledgeBase.topK);
    SuperAgent.config.save(cfg);
    AdminApp?.toast?.('KB settings saved ✓', 'success', 1200);
  },

  // ── Memory ─────────────────────────────────────────────────
  showAddMemory()  { const el = _ap_el('mem-add-form'); if (el) el.style.display = ''; _ap_el('mem-new-key')?.focus(); },
  hideAddMemory()  { const el = _ap_el('mem-add-form'); if (el) el.style.display = 'none'; },

  saveNewMemory() {
    const key   = _ap_el('mem-new-key')?.value?.trim();
    const val   = _ap_el('mem-new-val')?.value?.trim();
    const cat   = _ap_el('mem-new-cat')?.value || 'general';
    const tags  = (_ap_el('mem-new-tags')?.value || '').split(',').map(t=>t.trim()).filter(Boolean);
    if (!key || !val) { AdminApp?.toast?.('Key and value are required', 'warning'); return; }
    SuperAgent.memory.add(key, val, tags, cat);
    renderAgentPanel();
  },

  updateMemory(key, newValue) {
    const val = (newValue || '').trim();
    if (!val) return;
    const mems  = SuperAgent.memory.getAll();
    const entry = mems.find(m => m.key === key);
    if (entry) SuperAgent.memory.add(key, val, entry.tags || [], entry.category || 'general');
  },

  deleteMemory(key) { SuperAgent.memory.delete(key); renderAgentPanel(); },

  clearMemory() {
    if (!confirm('Clear ALL agent memories? This cannot be undone.')) return;
    SuperAgent.memory.clear();
    renderAgentPanel();
  },

  filterMemory(cat, btn) {
    document.querySelectorAll('.mem-cat-btn').forEach(b => {
      b.classList.remove('active');
      b.style.borderColor = 'var(--admin-border)';
      b.style.background  = 'transparent';
      b.style.color       = 'var(--admin-text-dim)';
    });
    btn.classList.add('active');
    btn.style.borderColor = 'rgba(99,102,241,.4)';
    btn.style.background  = 'rgba(99,102,241,.1)';
    btn.style.color       = '#818cf8';
    document.querySelectorAll('.mem-row').forEach(el => {
      el.style.display = cat === 'all' || el.dataset.cat === cat ? '' : 'none';
    });
  },

  exportMemory() {
    const mems = SuperAgent.memory.getAll();
    const blob = new Blob([JSON.stringify(mems, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'aria-memories-' + Date.now() + '.json';
    a.click();
    AdminApp?.toast?.('Memory exported ✓', 'success', 1500);
  },

  importMemory() {
    const inp     = document.createElement('input');
    inp.type      = 'file';
    inp.accept    = '.json';
    inp.onchange  = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('Expected a JSON array of memories');
        let count = 0;
        for (const m of data) {
          if (m.key && m.value) { SuperAgent.memory.add(m.key, m.value, m.tags||[], m.category||'general'); count++; }
        }
        AdminApp?.toast?.(`✅ Imported ${count} memories`, 'success');
        renderAgentPanel();
      } catch (e) { AdminApp?.toast?.(`Import failed: ${e.message}`, 'error'); }
    };
    inp.click();
  },

  // ── Integrations ───────────────────────────────────────────
  addIntegration() {
    const name     = _ap_el('int-name')?.value?.trim();
    const endpoint = _ap_el('int-endpoint')?.value?.trim();
    if (!name || !endpoint) { AdminApp?.toast?.('Name and endpoint are required', 'warning'); return; }
    const cfg  = SuperAgent.config.get();
    const integ = {
      id:          'int_' + Date.now(),
      name,
      endpoint,
      apiKey:      _ap_el('int-key')?.value?.trim() || '',
      authType:    _ap_el('int-auth')?.value || 'bearer',
      description: _ap_el('int-desc')?.value?.trim() || '',
      enabled:     true,
      createdAt:   new Date().toISOString(),
      lastUsed:    null,
    };
    cfg.apiIntegrations = [...(cfg.apiIntegrations || []), integ];
    // Auto-enable the integrations tool
    cfg.tools.apiIntegrations = true;
    SuperAgent.config.save(cfg);
    AdminApp?.toast?.(`✅ Integration "${name}" added`, 'success');
    ['int-name','int-endpoint','int-key','int-desc'].forEach(id => { const el = _ap_el(id); if (el) el.value = ''; });
    renderAgentPanel();
  },

  toggleIntegration(id) {
    const cfg = SuperAgent.config.get();
    cfg.apiIntegrations = (cfg.apiIntegrations || []).map(i => i.id === id ? { ...i, enabled: !i.enabled } : i);
    SuperAgent.config.save(cfg);
    renderAgentPanel();
  },

  deleteIntegration(id) {
    if (!confirm('Delete this integration?')) return;
    const cfg = SuperAgent.config.get();
    cfg.apiIntegrations = (cfg.apiIntegrations || []).filter(i => i.id !== id);
    SuperAgent.config.save(cfg);
    renderAgentPanel();
  },

  async testIntegration(id) {
    const cfg   = SuperAgent.config.get();
    const integ = (cfg.apiIntegrations || []).find(i => i.id === id);
    if (!integ) return;
    AdminApp?.toast?.(`Testing ${integ.name}…`, 'info', 2000);
    try {
      const r = await SuperAgent.executeSuperTool('call_integration', { name: integ.name, method: 'GET' });
      AdminApp?.toast?.(r.includes('HTTP 2') ? `✅ ${integ.name} responded OK` : `⚠ ${integ.name}: check response`, r.includes('HTTP 2') ? 'success' : 'warning');
    } catch (e) { AdminApp?.toast?.(`Test failed: ${e.message}`, 'error'); }
  },

  // ── Code & Calc ────────────────────────────────────────────
  testCalc() {
    const expr = _ap_el('calc-test')?.value?.trim();
    const res  = _ap_el('calc-result');
    if (!expr || !res) return;
    try {
      if (/[^0-9+\-*/.()%^ Math.,\s_a-zA-Z]/.test(expr)) throw new Error('Invalid characters in expression');
      // eslint-disable-next-line no-new-func
      const val = Function('"use strict"; return (' + expr + ')')();
      res.style.display = '';
      res.style.color   = '#10b981';
      res.textContent   = expr + ' = ' + (typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 12 }) : JSON.stringify(val));
    } catch (e) {
      res.style.display = '';
      res.style.color   = '#f87171';
      res.textContent   = 'Error: ' + e.message;
    }
  },

  testCode() {
    const code = _ap_el('code-test')?.value || '';
    const res  = _ap_el('code-result');
    if (!res) return;
    res.style.display = '';
    res.textContent   = 'Running…';
    SuperAgent.executeSuperTool('run_code', { code, timeout: 5000 }).then(r => {
      res.textContent = r || '(no output)';
      res.style.color = r?.startsWith?.('**Code Error') ? '#f87171' : '';
    }).catch(e => { res.textContent = 'Error: ' + e.message; res.style.color = '#f87171'; });
  },
};
