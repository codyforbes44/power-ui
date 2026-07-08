---
name: context-optimization
description: "This skill should be used for token-efficiency tactics inside a single agent trajectory: observation masking, prefix/prompt caching, context budgets, just-in-time skill and memory loading, retrieval scoping, and reducing the token weight of accumulated tool outputs. Route file-backed scratchpads to filesystem-context, handoff summaries to context-compression, and persistent semantic memory to memory-systems."
---

# Context Optimization

Tactics for keeping a single trajectory's context window lean without losing the information the model needs. The unit of work here is one active context — not cross-session state (that's `memory-systems`) and not end-of-session handoffs (that's `context-compression`).

## When to Use

- Tool outputs are accumulating and crowding out reasoning space
- You need to decide what to load into context and when (skills, memories, docs)
- Prompt cache hit rates matter for cost or latency
- Retrieval is pulling in more than the task needs

## Core Principles

**1. Tokens compete.** Every token in context competes for attention with every other token. Irrelevant content doesn't just cost money — it degrades selection and reasoning quality. Optimize for signal density, not completeness.

**2. Load just-in-time, not just-in-case.** Keep a compact routing layer (registry, index, table of contents) always in context, and load full content only when the task demands it. A 5-line "use when" entry that routes to a 500-line document beats the document sitting resident. This is the skill-registry pattern: κ (selection capacity) is roughly 50–100 items, so the routing layer itself must stay small.

**3. Stable prefix, volatile suffix.** Prompt caching only pays off when the prefix is byte-identical across calls. Order context as: system prompt → tools → static reference → conversation → fresh tool results. Never inject timestamps, random IDs, or per-call state into the stable region. A single changed byte invalidates everything after it.

## Observation Masking

The dominant weight in long agent trajectories is old tool output, not conversation. Options, in order of preference:

1. **Truncate at source.** Configure tools to return the minimum useful response (see `tool-design` for response-format options like `concise` vs `detailed`). Cheaper than cleaning up afterward.
2. **Mask after use.** Once a tool result has been acted on, replace it in the running transcript with a stub: `[fetched 40KB page — key fact extracted: X]`. Keep the extraction, drop the raw payload.
3. **Offload to disk.** Write large outputs to a file and keep only the path plus a one-line summary in context (`filesystem-context` covers the file conventions). Re-read slices on demand rather than holding the whole artifact.
4. **Windowed retention.** Keep the last N tool results verbatim and stubs for everything older. Recency correlates with relevance in most trajectories.

Never mask: error messages not yet resolved, constraints/requirements, and anything the user stated directly.

## Context Budgets

Set explicit budgets per category and enforce them mechanically:

| Category | Typical budget | Overflow strategy |
|---|---|---|
| Routing layer (registry, indexes) | 1–3% of window | Merge entries, cut to one line each |
| Task instructions + plan | 5–10% | Move detail to files, keep the checklist |
| Working set (current files, recent tool output) | 50–70% | Mask oldest, offload largest |
| History / prior turns | remainder | Compress via `context-compression` at threshold |

Trigger compaction at ~70–80% utilization, not at the hard limit — the model needs headroom to reason and produce output.

## Retrieval Scoping

When pulling memories, docs, or search results into context:

- Retrieve at the smallest useful granularity (section, not document; row, not table).
- Cap retrieval by budget, not by top-k alone — 5 short chunks ≠ 5 long ones.
- Deduplicate before injection; overlapping chunks waste budget and bias attention.
- Prefer a two-step pattern: retrieve titles/summaries first, then fetch full content only for the 1–2 items that actually match.

## Anti-Patterns

- **Resident everything:** loading all skills/docs "so they're available." Routing degrades and cache costs explode.
- **Summarize-then-need:** aggressively compressing content you'll need verbatim (code, error text, IDs). Offload verbatim content to files instead of lossy summaries.
- **Cache-breaking hygiene:** re-sorting tool lists, injecting dates into the system prompt, or rotating instructions per call.
- **Token golf on instructions:** shaving the prompt so hard the agent loses constraints. Optimize observations first; instructions are usually a small fraction of the weight.

## Related Skills

- `filesystem-context`: file-backed scratchpads and offloading conventions — where masked content goes.
- `context-compression`: turning a long trajectory into a prose handoff when the session must continue elsewhere.
- `memory-systems`: persistent semantic memory across sessions; this skill only manages the live window.
- `tool-design`: designing tool responses so they're cheap in the first place.
