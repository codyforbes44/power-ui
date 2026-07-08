# Skill Registry

Compact routing guide. Read the full SKILL.md only when the "Use when" line matches the task.
Sources: `public/` and `examples/` (Anthropic, catalog-only), `plugins/` (engineering pack, catalog-only), `user/` (owned here).
Last organized: 2026-07-07 — 43 user skills (36 after merges + 7 gap-fill additions), 72 total.

## Documents & Files (8 — public)

- **docx / pptx / xlsx / pdf**: Create and edit Word docs, slide decks, spreadsheets, PDFs.
  Use when: any Office/PDF file is the input or output deliverable.
- **file-reading**: Router for reading uploaded files by type.
  Use when: a file path is in `/mnt/user-data/uploads/` but content isn't in context.
- **pdf-reading**: Strategies for extracting content from PDFs (text, scanned, forms, tables).
  Use when: reading/inspecting a PDF, not creating one.
- **frontend-design**: Aesthetic direction, typography, non-templated UI choices.
  Use when: building or reshaping any web UI.
- **product-self-knowledge**: Verified facts about Claude Code, API, claude.ai plans.
  Use when: response would state Anthropic product facts from memory.

## Creative & Content (11 — examples)

- **canvas-design**: Static posters/art as PNG/PDF. Use when: designing a visual piece.
- **algorithmic-art**: Generative p5.js art. Use when: code-based/generative art requested.
- **slack-gif-creator**: Animated GIFs within Slack constraints. Use when: "GIF for Slack".
- **theme-factory**: Apply/generate visual themes for artifacts. Use when: styling slides, docs, landing pages.
- **brand-guidelines**: Anthropic brand colors/type. Use when: artifact should look like Anthropic.
- **web-artifacts-builder**: Multi-component React/shadcn artifacts. Use when: complex stateful artifact, not simple single-file.
- **doc-coauthoring**: Structured co-writing workflow. Use when: user wants to collaboratively write specs/proposals/decision docs.
- **internal-comms**: Company comms formats. Use when: status reports, leadership updates, FAQs, incident comms.
- **learn**: Teaching/explaining workflow. Use when: user wants understanding, not task output.
- **mcp-builder**: Build MCP servers (Python/TS). Use when: integrating an external API as MCP tools.
- **skill-creator**: Anthropic's skill creation/eval tooling. Use when: creating skills with eval benchmarks (see also user `skill-development`).

## Engineering Lifecycle (10 — plugins, catalog-only)

- **engineering:code-review**: Review a diff/PR for security, perf, correctness. Use when: given a PR to evaluate (for the subagent request/receive loop, prefer user `code-review-workflow`).
- **engineering:debug**: Structured reproduce→isolate→fix. Use when: debugging (user `systematic-debugging` is the stricter in-house variant; prefer it for owned code).
- **engineering:testing-strategy**: Test plans and coverage design. Use when: "how should we test X".
- **engineering:tech-debt**: Identify and prioritize debt. Use when: refactoring priorities, code health audits.
- **engineering:architecture**: ADRs and trade-off records. Use when: documenting a technology decision.
- **engineering:system-design**: Service/API/data-model design. Use when: designing a new system.
- **engineering:incident-response**: Triage, comms, postmortem. Use when: production incident.
- **engineering:deploy-checklist**: Pre-ship verification. Use when: about to release/deploy.
- **engineering:documentation**: READMEs, runbooks, API docs. Use when: writing technical docs.
- **engineering:standup**: Yesterday/today/blockers from activity. Use when: preparing standup.

## Dev Workflow Discipline (12 — user)

- **using-superpowers**: How to find and invoke skills; read before responding.
  Use when: starting any conversation in this workflow system.
- **brainstorming**: Explore intent/requirements before building.
  Use when: before ANY creative/feature work begins.
- **writing-plans**: Turn a spec into a task-by-task implementation plan.
  Use when: multi-step task with requirements, before touching code.
- **executing-plans**: Execute a written plan in a separate session with checkpoints.
  Use when: plan exists, work happens in a parallel session.
- **subagent-driven-development**: Execute plans via fresh subagent per task, or dispatch parallel subagents for independent problems.
  Use when: executing a plan in-session, or 2+ independent failures/tasks with no shared state.
  Sections: per-task loop, model selection, implementer statuses, parallel dispatch of independent tasks.
- **test-driven-development**: RED-GREEN-REFACTOR before implementation.
  Use when: implementing any feature or bugfix.
- **systematic-debugging**: Root-cause discipline before proposing fixes.
  Use when: any bug, test failure, or unexpected behavior.
- **verification-before-completion**: Evidence before claiming done/fixed/passing.
  Use when: about to claim success, commit, or open a PR.
- **code-review-workflow**: Request reviews via subagent; evaluate feedback with rigor, no performative agreement.
  Use when: after tasks/features, before merge, or when receiving review comments.
  Sections: requesting review (+ code-reviewer.md template), receiving feedback.
- **pr-checks**: CodeRabbit comments, description quality, pre-commit, tests on an existing PR.
  Use when: addressing review feedback on an open PR.
- **using-git-worktrees**: Isolated workspaces for feature work.
  Use when: starting work needing isolation from the current tree.
- **finishing-a-development-branch**: Merge/PR/cleanup decision at completion.
  Use when: implementation done, tests pass, integrating the work.

## Code Navigation & Search (3 — user)

- **file-search**: ripgrep text + ast-grep structural search. Use when: searching a codebase by pattern.
- **serena**: LSP symbol-level navigation and precise edits. Use when: find-references, symbol renames, IDE-like ops.
- **semtools**: Embedding-based semantic search (+ doc parsing). Use when: meaning-based search beyond keywords.

## Context & Memory (4 — user)

- **context-optimization**: In-window token tactics — masking, caching, budgets, JIT loading, retrieval scoping.
  Use when: one trajectory's context is bloating or cache/cost matters.
- **context-compression**: Compaction and handoff summaries that preserve session state.
  Use when: nearing compaction, handing off to a fresh session/agent, or pipeline-stage summaries.
- **filesystem-context**: File-backed scratchpads, run logs, output offloading, workspace conventions.
  Use when: state must survive the window or be shared between subagents.
- **memory-systems**: Persistent semantic memory — entity tracking, graph/vector retrieval, consolidation.
  Use when: cross-session knowledge retention beyond what files+grep can do.

## General Engineering Craft (6 — user)

- **data-analysis**: pandas/plotting workflow, data traps, honest statistics and charts.
  Use when: analyzing a dataset with code; the deliverable is findings, not a spreadsheet file.
- **security-review**: threat modeling plus category-by-category vulnerability audit.
  Use when: 'is this secure', security audits, pre-launch passes, untrusted-input handling.
- **database-and-migrations**: schema design, zero-downtime expand-migrate-contract, indexing, N+1.
  Use when: adding tables/columns, writing/reviewing migrations, or slow queries.
- **ci-cd-pipelines**: GitHub Actions authoring, caching, flaky CI, pipeline security, release automation.
  Use when: building or debugging CI/CD; 'works locally but not in CI'.
- **performance-profiling**: measure-first optimization — profilers, bottleneck classes, honest benchmarks.
  Use when: 'why is this slow', memory leaks, perf regressions.
- **git-workflow**: commit hygiene, interactive rebase, undo table, bisect, branch/tag conventions.
  Use when: cleaning up commits, undoing mistakes, writing commit messages.

## Agent Engineering Knowledge (5 — user)

- **project-development**: Project-level LLM system decisions — task fit, pipeline shape, cost estimation.
  Use when: the unit of work is a whole project or multi-stage pipeline.
- **multi-agent-patterns**: Supervisor/swarm coordination, handoffs, when multiple agents are justified.
  Use when: designing a multi-agent system or deciding whether to introduce sub-agents.
- **tool-design**: Tool descriptions, schemas, error messages, MCP server design, tool-set consolidation.
  Use when: the unit of work is a single tool or tool set.
- **hosted-agents**: Sandboxed/background agent infra — warm pools, session persistence, self-spawning.
  Use when: designing hosted or remote agent execution environments.
- **llm-eval-design**: Eval sets, graders (exact/rubric/LLM-judge), variance handling, honest result reading.
  Use when: 'how do we know it's good', building/analyzing evals, regression-testing LLM behavior.

## Skill Lifecycle (1 — user)

- **skill-development**: Write skills with TDD pressure-testing, evolve workflow-plan skills, organize the library.
  Use when: creating, editing, testing, or reorganizing skills; regenerating this registry.
  Sections: writing skills, evolving skills, organizing the library.

## MassGen Project (12 — user)

- **massgen**: Invoke the multi-agent system on a task. Use when: user wants multiple agents on writing/code/research.
- **massgen-config-creator**: YAML config authoring. Use when: creating MassGen configs for examples/tests/features.
- **backend-integrator**: Add a new LLM provider (~15 files). Use when: integrating or auditing an LLM backend.
- **multimedia-backend-integrator**: Add media backends to `generate_media`. Use when: new image/video/audio backend.
- **model-registry-maintainer**: Model/pricing registry upkeep. Use when: adding models or updating pricing/context data.
- **textual-ui-developer**: TUI development with replay + snapshot tests. Use when: developing/debugging the Textual UI.
- **massgen-log-analyzer**: Run experiments, analyze logs via SQL/logfire. Use when: performance analysis or ANALYSIS_REPORT.md needed.
- **massgen-develops-massgen**: Self-improvement workflows (automation mode / UI evaluation). Use when: MassGen improving itself.
- **massgen-release**: Full release documentation order + CHANGELOG/announcement automation.
  Use when: preparing, documenting, or validating a MassGen release.
  Sections: release documentation workflow, release prep automation.
- **image-generation / video-generation / audio-generation**: Media generation backend guides. Use when: generating/editing media through MassGen.

## Recently Added (2026-07-07)

- **context-optimization, context-compression, filesystem-context**: created to resolve dangling routes from memory-systems, project-development, and tool-design.
- **data-analysis, security-review, database-and-migrations, ci-cd-pipelines, performance-profiling, git-workflow, llm-eval-design**: gap-fill skills from the 2026-07-07 library audit.

## Merge Log (2026-07-07)

- requesting-code-review + receiving-code-review → **code-review-workflow** (code-reviewer.md template created)
- dispatching-parallel-agents → folded into **subagent-driven-development**
- release-prep + massgen-release-documenter → **massgen-release**
- writing-skills + evolving-skill-creator + skill-organizer → **skill-development**

## Deprecation Stubs (delete at upload source)

This environment restores deleted skill directories, so merged-away skills were converted to
deprecation stubs instead of removed. To finish the cleanup, delete these 8 skills wherever
they were uploaded (Claude settings / capabilities): requesting-code-review, receiving-code-review,
dispatching-parallel-agents, release-prep, massgen-release-documenter, writing-skills,
evolving-skill-creator, skill-organizer.
