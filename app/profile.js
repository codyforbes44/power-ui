/* ============================================================
   profile.js  —  User Persona Profile System
   All authenticated users can build a detailed profile that
   influences how the AI responds to them.
   ============================================================ */
'use strict';

const ProfileSystem = (() => {

  // ── Storage ────────────────────────────────────────────────
  const KEY = (u) => `async_profile_v1_${u}`;

  const DEFAULT = () => ({
    displayName:   '',
    avatarEmoji:   '🧑',
    pronouns:      '',
    bio:           '',
    occupation:    '',
    location:      '',
    expertise: {
      level: 'intermediate',
      areas: [],
    },
    goals:         [],
    style: {
      formality:   'balanced',
      detail:      'moderate',
      format:      'markdown',
      codeLanguage: '',
    },
    customInstructions: {
      always: '',
      never:  '',
    },
    adminNote:     '',
    timezone:      '',
    language:      'en',
    createdAt:     '',
    updatedAt:     '',
  });

  function get(username) {
    try {
      const raw = localStorage.getItem(KEY(username));
      if (!raw) return DEFAULT();
      return Object.assign(DEFAULT(), JSON.parse(raw));
    } catch { return DEFAULT(); }
  }

  function save(username, profile) {
    const p = Object.assign(DEFAULT(), profile, { updatedAt: new Date().toISOString() });
    if (!p.createdAt) p.createdAt = p.updatedAt;
    localStorage.setItem(KEY(username), JSON.stringify(p));
    return p;
  }

  function remove(username) { localStorage.removeItem(KEY(username)); }

  // Build AI context block injected into system prompt
  function buildSystemBlock(username) {
    const p = get(username);
    if (!p.displayName && !p.occupation && !p.bio && !p.expertise.areas.length && !p.goals.length &&
        !p.customInstructions.always && !p.customInstructions.never) return '';

    const lines = ['## User Profile'];
    const name = p.displayName || username;
    lines.push(`**Name:** ${name}${p.pronouns ? ` (${p.pronouns})` : ''}`);
    if (p.occupation) lines.push(`**Role:** ${p.occupation}`);
    if (p.location)   lines.push(`**Location:** ${p.location}`);
    if (p.bio)        lines.push(`**About:** ${p.bio}`);
    lines.push(`**Expertise:** ${p.expertise.level}`);
    if (p.expertise.areas.length) lines.push(`**Expert in:** ${p.expertise.areas.join(', ')}`);
    if (p.goals.length) lines.push(`**Goals:** ${p.goals.join(', ')}`);

    lines.push('');
    lines.push('## Communication Preferences');
    const fMap = { casual:'Use a conversational, casual tone.', balanced:'Use a friendly but professional tone.', formal:'Use a formal, professional tone.' };
    const dMap = { brief:'Keep responses concise.', moderate:'Provide moderate detail.', comprehensive:'Be thorough and comprehensive.' };
    const fmMap = { markdown:'Format with markdown.', plain:'Use plain text, no markdown.', structured:'Use structured sections with headers.' };
    if (fMap[p.style.formality]) lines.push(fMap[p.style.formality]);
    if (dMap[p.style.detail])    lines.push(dMap[p.style.detail]);
    if (fmMap[p.style.format])   lines.push(fmMap[p.style.format]);
    if (p.style.codeLanguage)    lines.push(`Prefer ${p.style.codeLanguage} for code examples.`);

    const ci = p.customInstructions;
    if (ci.always || ci.never) {
      lines.push('');
      lines.push('## Custom Instructions');
      if (ci.always) lines.push(`Always: ${ci.always}`);
      if (ci.never)  lines.push(`Never: ${ci.never}`);
    }
    return lines.join('\n');
  }

  // ── Modal constants ────────────────────────────────────────
  const EXPERTISE_AREAS = [
    'Software Development','Data Science / ML','Design / UX','Product Management',
    'Marketing','Finance / Accounting','Science / Research','Writing / Content',
    'Legal','Healthcare / Medicine','Education','Business Strategy',
    'DevOps / Infrastructure','Cybersecurity','Photography / Video','Music / Audio',
    'Gaming','Architecture','Engineering (Hardware)',
  ];
  const GOAL_OPTIONS = [
    'Build a product or startup','Learn new skills','Research topics',
    'Write content or copy','Code & software projects','Data analysis',
    'Creative brainstorming','Get career advice','Problem solving',
    'Personal productivity','Language learning','Academic work',
  ];
  const AVATAR_EMOJIS = [
    '🧑','👩','👨','🧑‍💻','👩‍💻','👨‍💻','🧑‍🎨','🧑‍🔬','🧑‍🏫','🧑‍💼','👩‍💼','👨‍💼',
    '🦸','🦸‍♀️','🦸‍♂️','🤖','👾','🎭','🐱','🦊','🐺','🐻','🐼','🦁','⭐','🔥','💎','🚀',
  ];

  let _user = null, _p = null, _tab = 'identity', _isAdmin = false;

  function open(username, opts) {
    if (document.getElementById('pm-overlay')) return;
    _user = username; _p = get(username);
    _isAdmin = (opts && opts.isAdmin) || false;
    _tab = 'identity';
    _injectStyles();
    _render();
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _reltime(iso) {
    if (!iso) return '';
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.round(d/60000)+'m ago';
    if (d < 86400000) return Math.round(d/3600000)+'h ago';
    return new Date(iso).toLocaleDateString();
  }
  function _fd(v){ return {casual:'Conversational & friendly — like chatting with a knowledgeable friend.',balanced:'Friendly but professional — clear, direct and approachable.',formal:'Structured & formal — suitable for business/academic contexts.'}[v]||''; }
  function _ld(v){ return {beginner:'Explain concepts thoroughly, avoid jargon, use simple analogies.',intermediate:'Assume core familiarity; skip basic explanations.',expert:'Use technical terminology freely; skip foundations.',professional:'Peer-level — industry standards, advanced nuance, no hand-holding.'}[v]||''; }

  function _seg(id, opts, cur, field) {
    return `<div class="pm-seg" id="${id}">${opts.map(([k,l])=>`<button class="pm-sb${cur===k?' on':''}" data-v="${k}" onclick="ProfileSystem._sc(this,'${field}')">${l}</button>`).join('')}</div>`;
  }

  function _chips(items, selected, type) {
    return `<div class="pm-chips">${items.map(a=>`<div class="pm-chip${selected.includes(a)?' on':''}" data-t="${type}" data-v="${_esc(a)}" onclick="ProfileSystem._tc(this)">${_esc(a)}</div>`).join('')}</div>`;
  }

  function _render() {
    const o = document.createElement('div');
    o.id = 'pm-overlay';
    o.innerHTML = `
<div id="pm-modal" role="dialog" aria-modal="true">
  <div id="pm-head">
    <div id="pm-av" onclick="ProfileSystem._ep()">
      <span id="pm-av-ico">${_p.avatarEmoji}</span><span id="pm-av-edit">✏️</span>
      <div id="pm-epicker" style="display:none" onclick="event.stopPropagation()">${AVATAR_EMOJIS.map(e=>`<span class="pm-eo" onclick="ProfileSystem._se('${e}')">${e}</span>`).join('')}</div>
    </div>
    <div id="pm-head-info">
      <h2 id="pm-hname">${_esc(_p.displayName||_user)}'s Profile</h2>
      <p>Your profile shapes how the AI communicates with you</p>
    </div>
    <button id="pm-x" onclick="ProfileSystem._close()">✕</button>
  </div>
  <div id="pm-tabs">
    ${[['identity','🙋 Identity'],['style','💬 Style'],['expertise','🎯 Expertise'],['instructions','📋 Instructions'],['preview','👁 Preview']].map(([k,l])=>`<button class="pm-tab${k===_tab?' on':''}" onclick="ProfileSystem._st('${k}')">${l}</button>`).join('')}
  </div>
  <div id="pm-body">
    <div class="pm-sec${_tab==='identity'?' on':''}" data-tab="identity">
      <div class="pm-row">
        <div class="pm-f"><label>Display Name</label><input id="pm-dn" value="${_esc(_p.displayName)}" placeholder="${_esc(_user)}" maxlength="60" oninput="ProfileSystem._uh()"></div>
        <div class="pm-f"><label>Pronouns</label><input id="pm-pr" value="${_esc(_p.pronouns)}" placeholder="he/him · she/her · they/them" maxlength="30"></div>
      </div>
      <div class="pm-f"><label>Occupation / Role</label><input id="pm-oc" value="${_esc(_p.occupation)}" placeholder="e.g. Software Engineer, Designer, Researcher" maxlength="80"></div>
      <div class="pm-row">
        <div class="pm-f"><label>Location</label><input id="pm-lo" value="${_esc(_p.location)}" placeholder="City, Country" maxlength="60"></div>
        <div class="pm-f"><label>Language</label><select id="pm-la">${[['en','English'],['es','Spanish'],['fr','French'],['de','German'],['ja','Japanese'],['zh','Chinese'],['pt','Portuguese'],['ko','Korean'],['ar','Arabic'],['ru','Russian'],['hi','Hindi'],['it','Italian']].map(([c,n])=>`<option value="${c}"${_p.language===c?' selected':''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="pm-f"><label>Bio / About Me</label><textarea id="pm-bi" maxlength="400" placeholder="Your background, interests, what you're working on…">${_esc(_p.bio)}</textarea></div>
    </div>
    <div class="pm-sec${_tab==='style'?' on':''}" data-tab="style">
      <div class="pm-f"><label>Conversation Tone</label>${_seg('pm-sg-fm',[['casual','😊 Casual'],['balanced','🤝 Balanced'],['formal','👔 Formal']],_p.style.formality,'formality')}<div class="pm-desc" id="pm-fd">${_fd(_p.style.formality)}</div></div>
      <div class="pm-f"><label>Response Detail</label>${_seg('pm-sg-dt',[['brief','⚡ Brief'],['moderate','📝 Moderate'],['comprehensive','📚 Comprehensive']],_p.style.detail,'detail')}</div>
      <div class="pm-f"><label>Output Format</label>${_seg('pm-sg-fo',[['markdown','📄 Markdown'],['structured','🗂 Structured'],['plain','💬 Plain']],_p.style.format,'format')}</div>
      <div class="pm-f"><label>Preferred Code Language</label><input id="pm-cl" value="${_esc(_p.style.codeLanguage)}" placeholder="e.g. Python, TypeScript, Rust, Go" maxlength="40"></div>
    </div>
    <div class="pm-sec${_tab==='expertise'?' on':''}" data-tab="expertise">
      <div class="pm-f"><label>Expertise Level</label>${_seg('pm-sg-lv',[['beginner','🌱 Beginner'],['intermediate','🌿 Intermediate'],['expert','🌳 Expert'],['professional','🏆 Professional']],_p.expertise.level,'level')}<div class="pm-desc" id="pm-ld">${_ld(_p.expertise.level)}</div></div>
      <div class="pm-f"><label>Areas of Expertise <span style="font-weight:400;text-transform:none;font-size:11px">(select all that apply)</span></label>${_chips(EXPERTISE_AREAS,_p.expertise.areas,'area')}</div>
      <div class="pm-f"><label>Goals <span style="font-weight:400;text-transform:none;font-size:11px">(what do you mainly use AI for?)</span></label>${_chips(GOAL_OPTIONS,_p.goals,'goal')}</div>
    </div>
    <div class="pm-sec${_tab==='instructions'?' on':''}" data-tab="instructions">
      ${_isAdmin?`<div class="pm-admin-note"><div class="pm-an-lbl">🔐 Admin System Directive</div><div style="font-size:12px;color:#fca5a5;margin-bottom:8px">Injected at the TOP of this user's system prompt. Super-admin only.</div><textarea id="pm-an" rows="3" placeholder="e.g. This user is a beta tester. Always mention new features. Grant experimental tool access.">${_esc(_p.adminNote)}</textarea></div>`:''}
      <div class="pm-f"><label>✅ Always do</label><textarea id="pm-al" rows="4" placeholder="e.g. Always cite sources. Always use TypeScript examples. Always structure answers with headers.">${_esc(_p.customInstructions.always)}</textarea></div>
      <div class="pm-f"><label>🚫 Never do</label><textarea id="pm-nv" rows="4" placeholder="e.g. Never use jargon without explaining. Never truncate code. Never give unsolicited opinions.">${_esc(_p.customInstructions.never)}</textarea></div>
      <div class="pm-tip">💡 These instructions are injected into every conversation. Be specific — the more context, the better the AI can tailor its responses to your needs.</div>
    </div>
    <div class="pm-sec${_tab==='preview'?' on':''}" data-tab="preview">
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:12px">Exact context block injected into the AI system prompt. Save first to update.</div>
      <pre id="pm-preview" class="pm-pre">${_esc(buildSystemBlock(_user))}</pre>
      <div style="margin-top:16px;font-size:12px;color:var(--text-muted,#94a3b8)">This is prepended to the system prompt so the AI knows who it's talking to — without you needing to repeat yourself.</div>
    </div>
  </div>
  <div id="pm-foot">
    <span id="pm-status" style="font-size:13px;color:var(--text-muted,#94a3b8)">${_p.updatedAt?'Last saved '+_reltime(_p.updatedAt):'Profile not yet saved'}</span>
    <div style="display:flex;gap:10px">
      <button class="pm-btn pm-btn2" onclick="ProfileSystem._close()">Cancel</button>
      <button class="pm-btn pm-btn1" onclick="ProfileSystem._save()">💾 Save Profile</button>
    </div>
  </div>
</div>`;
    o.addEventListener('click', e => { if (e.target === o) _close(); });
    document.body.appendChild(o);
  }

  function _st(k) { _collect(); _tab=k; document.querySelectorAll('.pm-sec').forEach(s=>s.classList.toggle('on',s.dataset.tab===k)); document.querySelectorAll('.pm-tab').forEach(t=>t.classList.toggle('on',t.getAttribute('onclick')?.includes(`'${k}'`))); if (k==='preview'){const el=document.getElementById('pm-preview');if(el)el.textContent=buildSystemBlock(_user);} }

  function _collect() {
    if (!_p) return;
    _p.displayName = document.getElementById('pm-dn')?.value.trim()||'';
    _p.pronouns    = document.getElementById('pm-pr')?.value.trim()||'';
    _p.occupation  = document.getElementById('pm-oc')?.value.trim()||'';
    _p.location    = document.getElementById('pm-lo')?.value.trim()||'';
    _p.language    = document.getElementById('pm-la')?.value||'en';
    _p.bio         = document.getElementById('pm-bi')?.value.trim()||'';
    _p.style.codeLanguage = document.getElementById('pm-cl')?.value.trim()||'';
    _p.customInstructions.always = document.getElementById('pm-al')?.value.trim()||'';
    _p.customInstructions.never  = document.getElementById('pm-nv')?.value.trim()||'';
    if (_isAdmin) _p.adminNote = document.getElementById('pm-an')?.value.trim()||'';
    _p.expertise.areas = [...document.querySelectorAll('.pm-chip.on[data-t="area"]')].map(c=>c.dataset.v);
    _p.goals = [...document.querySelectorAll('.pm-chip.on[data-t="goal"]')].map(c=>c.dataset.v);
  }

  function _save() {
    _collect();
    save(_user, _p);
    const st=document.getElementById('pm-status');
    if(st){st.innerHTML='<span style="color:#34d399;font-weight:600">✓ Profile saved!</span>';setTimeout(()=>{if(st)st.textContent='Saved just now';},2000);}
    if(_tab==='preview'){const el=document.getElementById('pm-preview');if(el)el.textContent=buildSystemBlock(_user);}
    window.dispatchEvent(new CustomEvent('profile-updated',{detail:{username:_user}}));
  }
  function _close() { document.getElementById('pm-overlay')?.remove(); }
  function _sc(btn, field) {
    const v=btn.dataset.v; btn.closest('.pm-seg')?.querySelectorAll('.pm-sb').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
    if(field==='formality'){_p.style.formality=v;const d=document.getElementById('pm-fd');if(d)d.textContent=_fd(v);}
    else if(field==='detail'){_p.style.detail=v;}
    else if(field==='format'){_p.style.format=v;}
    else if(field==='level'){_p.expertise.level=v;const d=document.getElementById('pm-ld');if(d)d.textContent=_ld(v);}
  }
  function _tc(el) {
    el.classList.toggle('on');
    const v=el.dataset.v, t=el.dataset.t;
    if(t==='area'){const i=_p.expertise.areas.indexOf(v);if(i===-1)_p.expertise.areas.push(v);else _p.expertise.areas.splice(i,1);}
    else if(t==='goal'){const i=_p.goals.indexOf(v);if(i===-1)_p.goals.push(v);else _p.goals.splice(i,1);}
  }
  function _ep() { const d=document.getElementById('pm-epicker');if(d)d.style.display=d.style.display==='none'?'flex':'none'; }
  function _se(e) { _p.avatarEmoji=e;const d=document.getElementById('pm-av-ico');if(d)d.textContent=e;const pk=document.getElementById('pm-epicker');if(pk)pk.style.display='none'; }
  function _uh() { const h=document.getElementById('pm-hname'),v=document.getElementById('pm-dn')?.value.trim();if(h)h.textContent=(v||_user)+"'s Profile"; }

  function _injectStyles() {
    if (document.getElementById('pm-css')) return;
    const s = document.createElement('style'); s.id = 'pm-css';
    s.textContent = `
#pm-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pm-fi .2s ease}
@keyframes pm-fi{from{opacity:0}to{opacity:1}}
@keyframes pm-si{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:none}}
#pm-modal{background:var(--surface-2,#1a1a2e);border:1px solid rgba(99,102,241,.25);border-radius:20px;width:100%;max-width:680px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);animation:pm-si .25s ease;color:var(--text-primary,#e2e8f0);font-family:inherit}
#pm-head{padding:22px 26px 18px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:14px;flex-shrink:0;background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(139,92,246,.05))}
#pm-av{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.2));border:2px solid rgba(99,102,241,.4);display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;transition:all .2s;flex-shrink:0;position:relative}
#pm-av:hover{border-color:var(--accent,#6366f1);transform:scale(1.05)}
#pm-av-edit{position:absolute;bottom:-3px;right:-3px;font-size:11px;background:var(--surface-2,#1a1a2e);border-radius:50%;padding:2px;line-height:1}
#pm-epicker{position:absolute;top:64px;left:0;z-index:101;background:var(--surface-2,#1a1a2e);border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:10px;display:flex;flex-wrap:wrap;width:230px;gap:2px;box-shadow:0 16px 40px rgba(0,0,0,.5)}
.pm-eo{width:28px;height:28px;font-size:17px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;transition:background .1s}
.pm-eo:hover{background:rgba(99,102,241,.2)}
#pm-head-info{flex:1}
#pm-head-info h2{margin:0 0 4px;font-size:19px;font-weight:700}
#pm-head-info p{margin:0;font-size:13px;color:var(--text-muted,#94a3b8)}
#pm-x{width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--text-muted,#94a3b8);cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
#pm-x:hover{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3);color:#ef4444}
#pm-tabs{display:flex;gap:3px;padding:10px 26px 0;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);flex-shrink:0;overflow-x:auto}
.pm-tab{padding:7px 13px;border-radius:8px 8px 0 0;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;border:1px solid transparent;border-bottom:none;color:var(--text-muted,#94a3b8);background:transparent;transition:all .15s;margin-bottom:-1px}
.pm-tab:hover{color:var(--text-primary,#e2e8f0);background:rgba(255,255,255,.04)}
.pm-tab.on{color:var(--accent,#6366f1);background:var(--surface-2,#1a1a2e);border-color:rgba(99,102,241,.25);border-bottom-color:var(--surface-2,#1a1a2e)}
#pm-body{flex:1;overflow-y:auto;padding:22px 26px;scrollbar-width:thin;scrollbar-color:rgba(99,102,241,.3) transparent}
.pm-sec{display:none}
.pm-sec.on{display:block}
.pm-f{margin-bottom:16px}
.pm-f label{display:block;font-size:11.5px;font-weight:700;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.pm-f input,.pm-f textarea,.pm-f select{width:100%;padding:9px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--text-primary,#e2e8f0);font-size:14px;font-family:inherit;transition:border-color .15s,box-shadow .15s;box-sizing:border-box}
.pm-f textarea{resize:vertical;min-height:80px}
.pm-f input:focus,.pm-f textarea:focus,.pm-f select:focus{outline:none;border-color:rgba(99,102,241,.5);box-shadow:0 0 0 3px rgba(99,102,241,.12);background:rgba(99,102,241,.04)}
.pm-f select option{background:#1a1a2e}
.pm-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pm-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:6px}
.pm-chip{padding:5px 11px;border-radius:20px;font-size:13px;cursor:pointer;user-select:none;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--text-secondary,#cbd5e1);transition:all .15s}
.pm-chip:hover{border-color:rgba(99,102,241,.4);color:var(--text-primary,#e2e8f0)}
.pm-chip.on{background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.5);color:#a5b4fc;font-weight:500}
.pm-seg{display:flex;gap:4px;background:rgba(0,0,0,.2);border-radius:10px;padding:3px;margin-top:6px}
.pm-sb{flex:1;padding:7px 8px;border-radius:7px;font-size:13px;text-align:center;cursor:pointer;border:none;background:transparent;color:var(--text-muted,#94a3b8);transition:all .15s}
.pm-sb.on{background:rgba(99,102,241,.25);color:#a5b4fc;font-weight:600;box-shadow:0 2px 8px rgba(99,102,241,.2)}
.pm-sb:hover:not(.on){background:rgba(255,255,255,.05);color:var(--text-primary,#e2e8f0)}
.pm-desc{font-size:12px;color:var(--text-muted,#94a3b8);margin-top:7px;min-height:16px}
.pm-pre{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:14px;font-size:12.5px;line-height:1.7;color:var(--text-secondary,#cbd5e1);white-space:pre-wrap;font-family:'JetBrains Mono',monospace;margin:0;max-height:220px;overflow-y:auto}
.pm-tip{font-size:12px;color:var(--text-muted,#94a3b8);background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.15);border-radius:10px;padding:12px;line-height:1.6}
.pm-admin-note{background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:14px;margin-bottom:16px}
.pm-an-lbl{font-size:11px;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
#pm-foot{padding:14px 26px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:rgba(0,0,0,.15)}
.pm-btn{padding:8px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .2s}
.pm-btn1{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.3)}
.pm-btn1:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,.4)}
.pm-btn2{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--text-secondary,#cbd5e1)}
.pm-btn2:hover{background:rgba(255,255,255,.1)}
@media(max-width:600px){.pm-row{grid-template-columns:1fr}#pm-modal{border-radius:14px 14px 0 0;position:fixed;bottom:0;left:0;right:0;max-height:95vh}#pm-overlay{align-items:flex-end;padding:0}.pm-sb{font-size:12px;padding:6px 5px}}`;
    document.head.appendChild(s);
  }

  return { get, save, remove, buildSystemBlock, open, _st, _sc, _tc, _ep, _se, _uh, _save, _close, _collect };
})();
