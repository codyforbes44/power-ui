# Async v2

A premium, local-first AI workspace — BYOK multi-model routing, 72 skills, encrypted memory, persistent history, team workspaces, and a full admin dashboard. Zero build step. No dependencies.

---

## Quick Start

**Option A — Direct file (simplest):**
```bash
open app/index.html          # macOS
# or drag app/index.html into any modern browser
```

**Option B — Local server (recommended for full features):**
```bash
python3 app/server.py
# Opens: http://localhost:8080
```
> The local server enables: `crypto.subtle` encryption, multi-device sync (SSE), MCP stdio bridge, and disk-backed state persistence.

---

## First Login

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

**You will be required to change your password on first login.**

---

## Site Structure

```
Claude/
├── public/                  ← Marketing site (public homepage)
│   ├── index.html           Landing page
│   ├── pricing.html         Pricing & subscription plans
│   ├── features.html        Feature deep-dives
│   ├── getting-started.html Documentation / quickstart
│   ├── about.html           About & philosophy
│   ├── privacy.html         Privacy Policy
│   ├── terms.html           Terms of Service
│   ├── images/
│   │   └── og-image.png     Social share card (generated — see tools/og-image/)
│   └── css/
│       └── public.css       Shared marketing stylesheet
│
├── tools/
│   └── og-image/            Regenerates the OG/Twitter share card from the
│                             real brand tokens (`node tools/og-image/generate.js`)
│
├── app/                     ← The actual application
│   ├── index.html           Main app entry point
│   ├── admin.html           Admin dashboard
│   ├── server.py            Local Python server (serves both app/ and public/)
│   ├── app.js               Core application (~2200 lines)
│   ├── styles.css           Design system
│   ├── auth.js              Auth (PBKDF2, AES-GCM vault, sessions)
│   ├── analytics.js         Event tracking + ring buffer
│   ├── api-router.js        Multi-provider streaming abstraction
│   ├── memory.js            Workspace + TF-IDF semantic memory
│   ├── models-data.js       Provider/model registry
│   ├── skills-data.js       72 skills + intent detection
│   ├── admin.js             Admin dashboard engine
│   └── cli.py               Python CLI (REST equivalent)
│
└── data/                    ← Server-managed persistence (auto-created)
    └── state.json
```

---

## Features

| Feature | Details |
|---------|---------|
| **BYOK Multi-Model** | Anthropic, OpenAI, Google Gemini, Groq — your keys, direct API access |
| **72 Skills** | Auto-injected skill registry with intent detection |
| **Encrypted Keys** | AES-256-GCM encrypted at rest; vault key derived from your password via PBKDF2 |
| **Semantic Memory** | TF-IDF workspace memory, auto-extracted from conversations |
| **Workspaces** | Isolated projects with per-workspace prompts, memory, and session history |
| **Cost Tracking** | Per-message and per-session cost with daily totals |
| **Conversation Branching** | Fork any reply to explore alternatives |
| **Streaming** | Real-time token streaming from all providers |
| **Template Gallery** | 16 starter templates with category filtering |
| **Admin Dashboard** | Analytics, user management, API key governance, MCP server registry |
| **Multi-Device Sync** | SSE-based real-time sync when running `server.py` |
| **MCP Bridge** | Spawn and communicate with stdio MCP servers via `server.py` |

---

## API Key Setup

After logging in:
1. Click your **user badge** (top-right) → **Settings**
2. Select a **provider tab** (Anthropic, OpenAI, Google, Groq)
3. Paste your API key and click **Save**

Keys are encrypted immediately with AES-256-GCM derived from your login password.

### Where to get keys

| Provider  | URL |
|-----------|-----|
| Anthropic | https://console.anthropic.com/settings/keys |
| OpenAI    | https://platform.openai.com/api-keys |
| Google    | https://aistudio.google.com/app/apikey |
| Groq      | https://console.groq.com/keys |

---

## Local Server

```bash
python3 app/server.py                        # http://127.0.0.1:8080
python3 app/server.py --port 9000            # Custom port
python3 app/server.py --host 0.0.0.0        # LAN access (multi-device sync)
DEBUG=1 python3 app/server.py               # Verbose logging
```

### URL Routes (when running server.py)

| URL | Serves |
|-----|--------|
| `http://localhost:8080/` | Redirects to public homepage |
| `http://localhost:8080/public/` | Marketing site |
| `http://localhost:8080/app/` | The AI application |
| `http://localhost:8080/api/ping` | Server health check |
| `http://localhost:8080/api/state` | State persistence endpoint |
| `http://localhost:8080/api/sync` | SSE multi-device sync stream |
| `http://localhost:8080/api/mcp/*` | MCP stdio bridge |

---

## Admin Dashboard

Navigate to `app/admin.html` or press **⌘⇧A** when logged in as admin.

| Panel | Description |
|-------|-------------|
| **Overview** | KPI cards, daily activity chart, model distribution |
| **Usage & Charts** | Hourly activity, token usage, session growth |
| **Cost Breakdown** | Daily/cumulative cost by model and provider |
| **Top Skills** | Most-used skill categories |
| **User Management** | Create, deactivate, reset passwords, delete users |
| **API Keys & MCP** | Manage provider keys and MCP server registrations |
| **System Health** | Storage usage, analytics buffer, localStorage breakdown |

---

## Testing

```bash
npm install
npx playwright install chromium   # first time only

npm run lint       # ESLint — no-redeclare is the important one (see eslint.config.js)
npm run test:unit  # node --test — proxy.js, ping.js, models-data.js, memory.js
npm run test:e2e   # Playwright — real Chromium against an isolated app/server.py copy
npm test           # all three
```

| Layer | Tool | What it covers |
|-------|------|-----------------|
| Lint | ESLint (`eslint.config.js`) | Structural bugs — `no-redeclare` catches a top-level `function` silently shadowing another, the exact failure mode of a past regression |
| Unit | Node's built-in test runner (`node:test`) | Pure logic: the Netlify proxy's request validation/method handling, model registry, TF-IDF memory scoring |
| E2E | Playwright, real Chromium | Full user flows — login, chat + tool-calling, image generation, Admin settings persistence, ServerSync — against `app/server.py` running from a throwaway temp copy (`tests/e2e/isolated-server.sh`), never your real `data/` directory |
| E2E (mobile) | Playwright, `devices['Pixel 5']` (`tests/e2e/mobile/`) | The flows that are actually different on a real mobile viewport — off-canvas sidebar/admin-nav drawers, touch taps landing where CSS says they should — each test scoped to its own isolated server the same way as the desktop suite |

CI (`.github/workflows/test.yml`) runs all three on every push and PR to `main`.

---

## Security

| Aspect | Implementation |
|--------|----------------|
| **Password hashing** | PBKDF2-SHA256, 310,000 iterations (NIST SP 800-132) |
| **API key storage** | AES-256-GCM encrypted; vault key in sessionStorage only |
| **Legacy migration** | SHA-256 accounts silently upgraded to PBKDF2 on login |
| **XSS** | AI output sanitized before DOM injection; `javascript:` URLs stripped |
| **CORS** | Server returns permissive CORS headers for localhost use |
| **Path traversal** | Static file handler blocks traversal outside allowed root dirs |

---

## Browser Requirements

| Browser | Minimum |
|---------|---------|
| Chrome  | 99+     |
| Firefox | 112+    |
| Safari  | 15.4+   |
| Edge    | 99+     |

> Requires HTTPS or `localhost` for `crypto.subtle` (AES-GCM encryption, PBKDF2 hashing) and `navigator.clipboard`.

---

## License

MIT License. See LICENSE for details.
Not affiliated with Anthropic PBC.
