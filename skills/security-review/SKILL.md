---
name: security-review
description: "Use for security-focused work: auditing code or a feature for vulnerabilities, threat modeling a design, reviewing dependency and secrets hygiene, and hardening auth/input handling. Trigger on 'is this secure', 'security audit', 'threat model', pre-launch security passes, or handling of untrusted input. Route general diff review to code-review-workflow or engineering:code-review — this skill is for dedicated security passes."
---

# Security Review

A structured pass for finding and fixing vulnerabilities. General code review catches security issues opportunistically; this skill is for when security is the point.

## Threat Modeling (do this first)

Before reading code, answer four questions (adapted STRIDE-lite):

1. **What are we protecting?** Data classes (credentials, PII, tokens, business data) and operations (payments, deletes, admin actions).
2. **Who can reach it?** Enumerate entry points: HTTP endpoints, queues, file uploads, CLI args, webhooks, third-party callbacks. Untrusted input is anything crossing a trust boundary — including data from your own database if another tenant wrote it.
3. **What can an attacker do?** For each entry point: spoof identity, tamper with data, replay, escalate, exfiltrate, deny service.
4. **What's the blast radius?** One user's data, one tenant, or everything? Prioritize findings by radius × reachability, not by CVSS theater.

Write the model down in 10–20 lines. Reviews without a model devolve into grep-for-eval.

## Audit Checklist by Category

**Injection (all forms)**
- SQL: parameterized queries only; flag any string-built query even if inputs "look safe today".
- Command: no shell interpolation of user input; prefer arg arrays over `shell=True`.
- Path traversal: normalize and verify resolved paths stay under the intended root before any file op.
- Template/XSS: context-aware escaping; flag `dangerouslySetInnerHTML`, `innerHTML`, `v-html`, `|safe`.
- LLM prompt injection: any untrusted text entering a prompt that can trigger tool calls is an injection surface — require confirmation for consequential actions originating from fetched content (see `tool-design`).

**Authentication & sessions**
- Password handling: bcrypt/argon2, never reversible; constant-time comparison for secrets.
- Session tokens: httpOnly, secure, sameSite; rotation on privilege change; server-side revocation path exists.
- Verify *every* state-changing endpoint checks auth — the classic hole is the one endpoint added last.

**Authorization**
- Check object-level access (IDOR): does `GET /orders/123` verify 123 belongs to the caller? This is the most common real-world vuln class; grep every handler that takes an ID.
- Deny by default; roles checked server-side, never trusted from the client.

**Secrets & config**
- No secrets in code, git history, logs, error messages, or client bundles. `git log -p | grep -iE 'key|secret|token'` on suspicion.
- Distinct credentials per environment; least-privilege service accounts.

**Input validation & deserialization**
- Validate type, length, range at the boundary; reject, don't sanitize-and-hope.
- No `pickle`/`yaml.load`/`ObjectInputStream` on untrusted bytes; use safe loaders.
- File uploads: verify content type by magic bytes, cap size, store outside webroot with generated names.

**Dependencies & supply chain**
- Run the ecosystem auditor (`npm audit`, `pip-audit`, `cargo audit`); triage by whether the vulnerable path is actually reachable.
- Pin with lockfiles; be suspicious of new transitive deps in a diff and typosquat-adjacent names.

**Transport & storage**
- TLS everywhere including internal hops that cross a network boundary; encrypt sensitive data at rest; verify backups inherit the same protections.

**Logging & errors**
- Log auth events and access to sensitive data (who, what, when) — enough to investigate an incident.
- Never log credentials, tokens, or full PII; never return stack traces or query text to clients.

## Review Mechanics

- Work entry-point-inward: pick one untrusted input and trace it to every sink. Repeat per entry point. This finds real chains; file-by-file reading finds style issues.
- For each finding record: location, category, attacker story ("an unauthenticated user can…"), severity by blast radius, and a concrete fix.
- Verify fixes by attempting the exploit path again, not by reading the patch.

## Severity & Reporting

- **Critical**: exploitable now by an unauthenticated or low-priv attacker; data exposure or takeover. Fix before anything ships.
- **High**: exploitable with user-level access or specific conditions.
- **Medium**: defense-in-depth gaps, missing hardening.
- **Low/Info**: hygiene.

Report leads with the attacker stories, not the tool output. A finding without a path to exploitation is a hygiene note, not a vulnerability — label honestly.

## Related Skills

- `code-review-workflow` / `engineering:code-review`: general review that includes a security lens.
- `tool-design`: designing agent tools that handle untrusted content safely.
- `engineering:incident-response`: when a review finding turns out to be actively exploited.
