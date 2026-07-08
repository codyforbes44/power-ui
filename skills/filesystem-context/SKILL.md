---
name: filesystem-context
description: "This skill should be used for file-backed working state in agent systems: scratchpads, run logs, plan and ledger files, offloading large tool outputs to disk, and directory conventions for agent workspaces. Route in-window token tactics to context-optimization, prose handoff summaries to context-compression, and semantic retrieval or cross-session knowledge to memory-systems."
---

# Filesystem Context

Using the filesystem as the agent's extended memory: cheap, durable, verbatim, and re-readable in slices. The context window is RAM; the filesystem is disk. Most "the agent forgot" failures are really "the state only lived in the window" failures.

## When to Use

- A tool output is large but only partially needed now (offload, keep the path)
- Multi-step work needs a plan/progress record that survives compaction
- Multiple subagents need shared, inspectable state without sharing context
- You need verbatim fidelity (code, logs, IDs) that summaries would corrupt

## Core Patterns

### 1. Scratchpad

One markdown file per task, append-mostly, owned by the coordinating agent:

```
scratch/<task-slug>/
  notes.md        # findings, decisions, open questions
  plan.md         # checklist with [ ]/[x] status (see writing-plans)
  ledger.md       # per-task status log in subagent workflows
```

Rules: append findings as you go, never rely on remembering to write at the end; date-stamp entries in long-running tasks; record *decisions with reasons*, not narration.

### 2. Output Offloading

When a tool returns a large payload:

```
raw/<source>-<slug>.<ext>     # verbatim payload
```

Keep in context only: the path, the size, and a 1–2 line extraction of what mattered. Re-read specific slices (`sed -n '120,180p'`, `grep -n`) instead of reloading the whole file. This is the disk half of observation masking (`context-optimization`).

### 3. Run Logs

For pipelines and experiments, write structured logs the agent (or a later analysis pass) can query:

- One directory per run, named with timestamp + config slug
- Machine-readable events (JSONL) alongside human-readable summary
- Never overwrite a run directory; append runs, prune by age

### 4. Shared State Between Subagents

Subagents should not inherit the coordinator's context (see `subagent-driven-development`); they *should* share files:

- Coordinator writes the task spec to a file; subagent reads it — the file is the contract
- Subagent writes results to an agreed output path; coordinator reads and verifies
- Concurrent writers get separate files merged by the coordinator — never have two agents append to the same file

## Conventions That Prevent Pain

- **Predictable paths beat clever paths.** `scratch/<task>/notes.md` every time; discoverability is the point.
- **Small files over one giant file.** Re-reading cost is proportional to file size; split by concern.
- **State the freshness.** A stale plan file confidently followed is worse than none — mark files with last-updated and re-verify against reality (git log, test output) after any gap.
- **Files are ground truth for verbatim data; the window is ground truth for user intent.** When they conflict about what the user wants, the conversation wins.
- **Clean up on completion.** Scratch directories from finished tasks are noise for the next task's file searches; archive or delete at the end (see `finishing-a-development-branch`).

## When Files Are Not Enough

Plain files stop scaling when you need *semantic* access — "what do we know about entity X across all past runs?" That's the boundary with `memory-systems`: files are addressed by path and grep; memories are addressed by meaning. Start with files; graduate to a memory system only when path-and-grep retrieval demonstrably fails.

## Anti-Patterns

- **Write-only scratchpads:** dutifully logging state and never reading it back. Every plan/ledger read should precede a decision.
- **Context mirroring:** keeping the full file content in the window *and* on disk. Offloading only pays if the window copy is dropped.
- **One mega-NOTES.md across tasks:** grows unboundedly, becomes unsearchable, and leaks stale decisions into new work.
- **Trusting your own stale writes:** a file you wrote 200 turns ago has the authority of a stranger's comment — verify before acting on it.

## Related Skills

- `context-optimization`: deciding *what* to offload and when; this skill covers *where and how*.
- `context-compression`: prose handoffs point into these files instead of inlining them.
- `memory-systems`: semantic, cross-session retrieval once path-based access stops scaling.
