---
name: context-compression
description: "This skill should be used for conversation compaction and handoff summaries: compressing a long trajectory into prose that preserves session state, writing handoffs so a fresh agent or session can resume work, and deciding what survives compaction. Route live-window token tactics to context-optimization, file-backed scratchpads to filesystem-context, and persistent cross-session memory to memory-systems."
---

# Context Compression

Turning a long trajectory into a compact, human-readable summary that lets work continue — in the same session after compaction, in a fresh session, or in a different agent's hands. The failure mode this skill prevents: a resumed agent that confidently proceeds with the wrong plan because the summary dropped a constraint.

## When to Use

- Context utilization is approaching the compaction threshold (~70–80%)
- Handing work to a fresh session, a subagent, or a teammate
- A pipeline stage produced a long trajectory whose conclusions feed the next stage
- Ending a work session that will resume later

## What Must Survive Compaction

Compression is lossy by design; the skill is choosing the right losses. Preserve, verbatim where possible:

1. **The goal, in the user's own words.** Paraphrase drifts; drift compounds across compactions.
2. **Hard constraints and decisions.** "Do NOT touch prod config", "we chose SQS over Kafka because X". Include the *because* — a decision without its reason gets relitigated.
3. **Current state, precisely.** What is done, what is in progress, what is untouched. Distinguish "implemented" from "implemented and verified" (see `verification-before-completion`).
4. **Open questions and known unknowns.** Anything the previous agent was unsure about becomes an invisible landmine if dropped.
5. **Exact identifiers.** File paths, branch names, commit SHAs, ticket IDs, error strings, URLs. These must never be paraphrased.
6. **Failed approaches.** What was tried and why it didn't work — otherwise the successor retries it.

Safe to drop: raw tool outputs already acted on, exploratory reading that led nowhere, conversational back-and-forth, and reasoning that concluded (keep the conclusion).

## Handoff Template

```markdown
# Handoff: <task name>

## Goal
<original request, quoted or near-verbatim>

## Constraints & Decisions
- <constraint> (source: user / plan / discovered)
- Decided <X> over <Y> because <reason>

## State
- Done + verified: ...
- Done, NOT verified: ...
- In progress: <exactly where it stopped — file, function, failing test>
- Not started: ...

## Key References
- Branch: ... | Base SHA: ... | Files touched: ...
- Relevant docs/scratchpad: <paths — see filesystem-context>

## Failed Approaches
- Tried <X>: failed because <Y>

## Open Questions
- ...

## Next Step
<the single concrete action the successor should take first>
```

The "Next Step" line matters most: a handoff that ends with a specific first action gets resumed correctly; one that ends with state description gets re-planned from scratch.

## Compaction Mechanics

- **Compress early, not at the wall.** At the hard limit you no longer have room to write a good summary.
- **Summarize the old, keep the recent.** Compact everything except the last few turns; the working set stays verbatim.
- **Provenance-tag claims.** Mark whether each item came from the user, from your own inference, or from a tool result. Post-compaction agents treat everything in the summary as equally authoritative — tagging prevents suggestion-to-decision inflation.
- **Verify against artifacts.** Before trusting a summary's "tests pass", re-run the check. Summaries inherit the optimism of their authors.
- **Iterative compaction compounds loss.** After 2–3 rounds, rebuild the summary from ground truth (files, git log, plan doc) rather than compressing the compression.

## Pipeline-Stage Summaries

When one stage's trajectory feeds the next stage (see `project-development`):

- Output a **structured** summary (JSON or fixed headings), not free prose — the consumer is a parser or a prompt template, and drift breaks it.
- Include confidence/caveats as a first-class field, not buried in prose.
- Keep the raw trajectory on disk (`filesystem-context`) with a path in the summary, so downstream stages can audit rather than trust.

## Anti-Patterns

- **Narrative summaries:** "First we looked at X, then we..." — chronology is the least useful axis. Organize by state, not story.
- **Optimistic collapse:** merging "I suggested X" and "user seemed positive" into "we decided X".
- **Dropping the negative space:** omitting what was ruled out, guaranteeing it gets re-explored.
- **Paraphrased identifiers:** "the config file" instead of `massgen/configs/prod.yaml`.

## Related Skills

- `context-optimization`: keeping the live window lean so compaction happens later and less often.
- `filesystem-context`: where full-fidelity state lives; handoffs should point into it rather than inline everything.
- `memory-systems`: durable cross-session memory; a handoff is a one-shot transfer, not a memory store.
