// Claude Skills Library — parsed from SKILL_REGISTRY.md (2026-07-07)
// v2: enhanced with intent-matching triggers for auto-injection

const SKILLS_DATA = {
  domains: [
    {
      id: 'documents',
      name: 'Documents & Files',
      icon: '📄',
      color: '#6366f1',
      count: 8,
      skills: [
        { name: 'docx / pptx / xlsx / pdf', slug: 'office-files', desc: 'Create and edit Word docs, slide decks, spreadsheets, PDFs.', useWhen: 'any Office/PDF file is the input or output deliverable', source: 'public', tags: ['files', 'documents', 'office'], triggers: ['word doc', 'powerpoint', 'excel', 'spreadsheet', 'pdf', 'slide deck', 'presentation', 'docx', 'xlsx'] },
        { name: 'file-reading', slug: 'file-reading', desc: 'Router for reading uploaded files by type.', useWhen: 'a file path is in /mnt/user-data/uploads/ but content isn\'t in context', source: 'public', tags: ['files', 'reading'], triggers: ['read file', 'open file', 'parse file', 'extract from', 'file content', 'uploaded file'] },
        { name: 'pdf-reading', slug: 'pdf-reading', desc: 'Strategies for extracting content from PDFs (text, scanned, forms, tables).', useWhen: 'reading/inspecting a PDF, not creating one', source: 'public', tags: ['pdf', 'reading'], triggers: ['read pdf', 'extract pdf', 'parse pdf', 'pdf content', 'scanned document', 'pdf table'] },
        { name: 'frontend-design', slug: 'frontend-design', desc: 'Aesthetic direction, typography, non-templated UI choices.', useWhen: 'building or reshaping any web UI', source: 'public', tags: ['design', 'ui', 'frontend'], triggers: ['ui design', 'frontend', 'web design', 'typography', 'layout', 'color scheme', 'visual design', 'interface'] },
        { name: 'product-self-knowledge', slug: 'product-self-knowledge', desc: 'Verified facts about Claude Code, API, claude.ai plans.', useWhen: 'response would state Anthropic product facts from memory', source: 'public', tags: ['claude', 'anthropic', 'facts'], triggers: ['claude api', 'anthropic', 'claude.ai', 'claude code', 'pricing plan', 'api limits'] },
        { name: 'canvas-design', slug: 'canvas-design', desc: 'Static posters/art as PNG/PDF.', useWhen: 'designing a visual piece', source: 'examples', tags: ['design', 'art', 'visual'], triggers: ['poster', 'banner', 'artwork', 'graphic design', 'visual asset', 'illustration'] },
        { name: 'algorithmic-art', slug: 'algorithmic-art', desc: 'Generative p5.js art.', useWhen: 'code-based/generative art requested', source: 'examples', tags: ['art', 'code', 'generative'], triggers: ['generative art', 'p5.js', 'creative coding', 'procedural', 'particle system', 'shader'] },
        { name: 'slack-gif-creator', slug: 'slack-gif-creator', desc: 'Animated GIFs within Slack constraints.', useWhen: 'GIF for Slack', source: 'examples', tags: ['slack', 'gif', 'animation'], triggers: ['slack gif', 'animated gif', 'slack emoji', 'reaction gif'] },
      ]
    },
    {
      id: 'creative',
      name: 'Creative & Content',
      icon: '🎨',
      color: '#8b5cf6',
      count: 8,
      skills: [
        { name: 'theme-factory', slug: 'theme-factory', desc: 'Apply/generate visual themes for artifacts.', useWhen: 'styling slides, docs, landing pages', source: 'examples', tags: ['design', 'themes', 'visual'], triggers: ['theme', 'style guide', 'color palette', 'visual identity', 'brand colors', 'design system'] },
        { name: 'brand-guidelines', slug: 'brand-guidelines', desc: 'Anthropic brand colors/type.', useWhen: 'artifact should look like Anthropic', source: 'examples', tags: ['brand', 'anthropic', 'design'], triggers: ['anthropic brand', 'brand guidelines', 'brand colors', 'on-brand', 'brand style'] },
        { name: 'web-artifacts-builder', slug: 'web-artifacts-builder', desc: 'Multi-component React/shadcn artifacts.', useWhen: 'complex stateful artifact, not simple single-file', source: 'examples', tags: ['react', 'web', 'artifacts'], triggers: ['react component', 'shadcn', 'interactive artifact', 'stateful ui', 'web app artifact'] },
        { name: 'doc-coauthoring', slug: 'doc-coauthoring', desc: 'Structured co-writing workflow.', useWhen: 'user wants to collaboratively write specs/proposals/decision docs', source: 'examples', tags: ['writing', 'docs', 'collaboration'], triggers: ['co-write', 'draft together', 'help me write', 'spec document', 'proposal', 'decision doc'] },
        { name: 'internal-comms', slug: 'internal-comms', desc: 'Company comms formats.', useWhen: 'status reports, leadership updates, FAQs, incident comms', source: 'examples', tags: ['comms', 'business', 'writing'], triggers: ['status update', 'leadership update', 'all-hands', 'announcement', 'faq', 'internal memo', 'company comms'] },
        { name: 'learn', slug: 'learn', desc: 'Teaching/explaining workflow.', useWhen: 'user wants understanding, not task output', source: 'examples', tags: ['teaching', 'explanation', 'learning'], triggers: ['explain', 'teach me', 'help me understand', 'how does', 'what is', 'tutorial', 'learning'] },
        { name: 'mcp-builder', slug: 'mcp-builder', desc: 'Build MCP servers (Python/TS).', useWhen: 'integrating an external API as MCP tools', source: 'examples', tags: ['mcp', 'api', 'integration'], triggers: ['mcp server', 'mcp tool', 'model context protocol', 'build mcp', 'api integration', 'tool integration'] },
        { name: 'skill-creator', slug: 'skill-creator', desc: 'Anthropic\'s skill creation/eval tooling.', useWhen: 'creating skills with eval benchmarks', source: 'examples', tags: ['skills', 'eval', 'tooling'], triggers: ['create skill', 'new skill', 'skill eval', 'skill benchmark', 'skill testing'] },
      ]
    },
    {
      id: 'engineering-lifecycle',
      name: 'Engineering Lifecycle',
      icon: '⚙️',
      color: '#06b6d4',
      count: 10,
      skills: [
        { name: 'code-review', slug: 'eng-code-review', desc: 'Review a diff/PR for security, perf, correctness.', useWhen: 'given a PR to evaluate', source: 'plugins', tags: ['code', 'review', 'pr'], triggers: ['code review', 'review this', 'pull request', 'pr feedback', 'diff review', 'check this code'] },
        { name: 'debug', slug: 'eng-debug', desc: 'Structured reproduce→isolate→fix.', useWhen: 'debugging', source: 'plugins', tags: ['debug', 'bugs', 'fix'], triggers: ['bug', 'error', 'not working', 'broken', 'fix this', 'debug', 'exception', 'crash'] },
        { name: 'testing-strategy', slug: 'eng-testing', desc: 'Test plans and coverage design.', useWhen: 'how should we test X', source: 'plugins', tags: ['testing', 'coverage', 'strategy'], triggers: ['test plan', 'test strategy', 'test coverage', 'how to test', 'testing approach', 'test suite'] },
        { name: 'tech-debt', slug: 'eng-tech-debt', desc: 'Identify and prioritize debt.', useWhen: 'refactoring priorities, code health audits', source: 'plugins', tags: ['refactoring', 'debt', 'health'], triggers: ['tech debt', 'refactor', 'code quality', 'code health', 'cleanup', 'legacy code'] },
        { name: 'architecture', slug: 'eng-architecture', desc: 'ADRs and trade-off records.', useWhen: 'documenting a technology decision', source: 'plugins', tags: ['architecture', 'adr', 'decisions'], triggers: ['architecture decision', 'adr', 'tech decision', 'trade-off', 'technology choice'] },
        { name: 'system-design', slug: 'eng-system-design', desc: 'Service/API/data-model design.', useWhen: 'designing a new system', source: 'plugins', tags: ['system', 'design', 'api'], triggers: ['system design', 'design a service', 'api design', 'data model', 'schema design', 'microservice'] },
        { name: 'incident-response', slug: 'eng-incident', desc: 'Triage, comms, postmortem.', useWhen: 'production incident', source: 'plugins', tags: ['incident', 'production', 'postmortem'], triggers: ['incident', 'outage', 'production down', 'postmortem', 'on-call', 'escalation', 'p0', 'p1'] },
        { name: 'deploy-checklist', slug: 'eng-deploy', desc: 'Pre-ship verification.', useWhen: 'about to release/deploy', source: 'plugins', tags: ['deploy', 'release', 'checklist'], triggers: ['deploy', 'release', 'ship', 'launch', 'go live', 'production deploy', 'rollout'] },
        { name: 'documentation', slug: 'eng-docs', desc: 'READMEs, runbooks, API docs.', useWhen: 'writing technical docs', source: 'plugins', tags: ['docs', 'readme', 'runbook'], triggers: ['readme', 'documentation', 'runbook', 'api docs', 'write docs', 'technical writing'] },
        { name: 'standup', slug: 'eng-standup', desc: 'Yesterday/today/blockers from activity.', useWhen: 'preparing standup', source: 'plugins', tags: ['standup', 'agile', 'team'], triggers: ['standup', 'daily update', 'what i did', 'blockers', 'scrum', 'sprint'] },
      ]
    },
    {
      id: 'dev-workflow',
      name: 'Dev Workflow Discipline',
      icon: '🔄',
      color: '#10b981',
      count: 12,
      skills: [
        { name: 'using-superpowers', slug: 'using-superpowers', desc: 'How to find and invoke skills; read before responding.', useWhen: 'starting any conversation in this workflow system', source: 'user', tags: ['meta', 'skills', 'workflow'], triggers: ['which skill', 'what skill', 'find skill', 'skill for this', 'invoke skill'] },
        { name: 'brainstorming', slug: 'brainstorming', desc: 'Explore intent/requirements before building.', useWhen: 'before ANY creative/feature work begins', source: 'user', tags: ['brainstorm', 'ideation', 'requirements'], triggers: ['brainstorm', 'explore ideas', 'think through', 'requirements', 'before we build', 'ideate', 'what should we'] },
        { name: 'writing-plans', slug: 'writing-plans', desc: 'Turn a spec into a task-by-task implementation plan.', useWhen: 'multi-step task with requirements, before touching code', source: 'user', tags: ['planning', 'spec', 'tasks'], triggers: ['write a plan', 'implementation plan', 'task breakdown', 'project plan', 'plan this out', 'planning'] },
        { name: 'executing-plans', slug: 'executing-plans', desc: 'Execute a written plan in a separate session with checkpoints.', useWhen: 'plan exists, work happens in a parallel session', source: 'user', tags: ['execution', 'plans', 'parallel'], triggers: ['execute plan', 'follow the plan', 'implement plan', 'carry out', 'checkpoint'] },
        { name: 'subagent-driven-development', slug: 'subagent-driven-development', desc: 'Execute plans via fresh subagent per task, or dispatch parallel subagents.', useWhen: 'executing a plan in-session, or 2+ independent failures/tasks', source: 'user', tags: ['subagent', 'parallel', 'agents'], triggers: ['subagent', 'parallel tasks', 'multiple agents', 'delegate to', 'spawn agent'] },
        { name: 'test-driven-development', slug: 'tdd', desc: 'RED-GREEN-REFACTOR before implementation.', useWhen: 'implementing any feature or bugfix', source: 'user', tags: ['tdd', 'testing', 'redgreen'], triggers: ['tdd', 'test driven', 'write tests first', 'red green refactor', 'test before code'] },
        { name: 'systematic-debugging', slug: 'systematic-debugging', desc: 'Root-cause discipline before proposing fixes.', useWhen: 'any bug, test failure, or unexpected behavior', source: 'user', tags: ['debug', 'rootcause', 'discipline'], triggers: ['root cause', 'systematic debug', 'reproduce bug', 'isolate issue', 'trace error'] },
        { name: 'verification-before-completion', slug: 'verification', desc: 'Evidence before claiming done/fixed/passing.', useWhen: 'about to claim success, commit, or open a PR', source: 'user', tags: ['verification', 'evidence', 'quality'], triggers: ['verify', 'is it done', 'confirm working', 'evidence', 'proof it works', 'validation'] },
        { name: 'code-review-workflow', slug: 'code-review-workflow', desc: 'Request reviews via subagent; evaluate feedback with rigor.', useWhen: 'after tasks/features, before merge, or when receiving review comments', source: 'user', tags: ['code-review', 'subagent', 'feedback'], triggers: ['get review', 'request review', 'review feedback', 'before merge', 'review comments'] },
        { name: 'pr-checks', slug: 'pr-checks', desc: 'CodeRabbit comments, description quality, pre-commit, tests on an existing PR.', useWhen: 'addressing review feedback on an open PR', source: 'user', tags: ['pr', 'review', 'checks'], triggers: ['coderabbit', 'pr description', 'pre-commit', 'pr checks', 'open pr', 'pr feedback'] },
        { name: 'using-git-worktrees', slug: 'git-worktrees', desc: 'Isolated workspaces for feature work.', useWhen: 'starting work needing isolation from the current tree', source: 'user', tags: ['git', 'worktrees', 'isolation'], triggers: ['git worktree', 'worktree', 'isolated branch', 'parallel development'] },
        { name: 'finishing-a-development-branch', slug: 'finishing-branch', desc: 'Merge/PR/cleanup decision at completion.', useWhen: 'implementation done, tests pass, integrating the work', source: 'user', tags: ['git', 'merge', 'cleanup'], triggers: ['finish branch', 'merge branch', 'branch cleanup', 'integration', 'wrap up'] },
      ]
    },
    {
      id: 'code-nav',
      name: 'Code Navigation & Search',
      icon: '🔍',
      color: '#f59e0b',
      count: 3,
      skills: [
        { name: 'file-search', slug: 'file-search', desc: 'ripgrep text + ast-grep structural search.', useWhen: 'searching a codebase by pattern', source: 'user', tags: ['search', 'ripgrep', 'ast'], triggers: ['search codebase', 'find in files', 'ripgrep', 'grep', 'ast-grep', 'pattern search'] },
        { name: 'serena', slug: 'serena', desc: 'LSP symbol-level navigation and precise edits.', useWhen: 'find-references, symbol renames, IDE-like ops', source: 'user', tags: ['lsp', 'symbols', 'navigation'], triggers: ['find references', 'rename symbol', 'lsp', 'go to definition', 'symbol navigation', 'serena'] },
        { name: 'semtools', slug: 'semtools', desc: 'Embedding-based semantic search (+ doc parsing).', useWhen: 'meaning-based search beyond keywords', source: 'user', tags: ['semantic', 'embeddings', 'search'], triggers: ['semantic search', 'embedding search', 'meaning based', 'similar code', 'semtools'] },
      ]
    },
    {
      id: 'context-memory',
      name: 'Context & Memory',
      icon: '🧠',
      color: '#ec4899',
      count: 4,
      skills: [
        { name: 'context-optimization', slug: 'context-optimization', desc: 'In-window token tactics — masking, caching, budgets, JIT loading.', useWhen: 'one trajectory\'s context is bloating or cache/cost matters', source: 'user', tags: ['context', 'tokens', 'optimization'], triggers: ['context window', 'token budget', 'context full', 'reduce tokens', 'optimize context', 'prompt caching'] },
        { name: 'context-compression', slug: 'context-compression', desc: 'Compaction and handoff summaries that preserve session state.', useWhen: 'nearing compaction, handing off to a fresh session/agent', source: 'user', tags: ['compression', 'handoff', 'session'], triggers: ['compress context', 'context limit', 'summarize session', 'handoff', 'compaction', 'fresh session'] },
        { name: 'filesystem-context', slug: 'filesystem-context', desc: 'File-backed scratchpads, run logs, output offloading.', useWhen: 'state must survive the window or be shared between subagents', source: 'user', tags: ['filesystem', 'scratchpad', 'persistence'], triggers: ['scratchpad', 'save state', 'persist across', 'share between agents', 'file backed'] },
        { name: 'memory-systems', slug: 'memory-systems', desc: 'Persistent semantic memory — entity tracking, graph/vector retrieval.', useWhen: 'cross-session knowledge retention beyond what files+grep can do', source: 'user', tags: ['memory', 'semantic', 'persistence'], triggers: ['remember this', 'persist memory', 'cross session', 'entity tracking', 'knowledge graph', 'vector memory'] },
      ]
    },
    {
      id: 'engineering-craft',
      name: 'General Engineering Craft',
      icon: '🛠️',
      color: '#84cc16',
      count: 6,
      skills: [
        { name: 'data-analysis', slug: 'data-analysis', desc: 'pandas/plotting workflow, data traps, honest statistics and charts.', useWhen: 'analyzing a dataset with code; the deliverable is findings', source: 'user', tags: ['data', 'pandas', 'statistics'], triggers: ['data analysis', 'analyze data', 'pandas', 'statistics', 'data visualization', 'chart', 'plot', 'dataset'] },
        { name: 'security-review', slug: 'security-review', desc: 'Threat modeling plus category-by-category vulnerability audit.', useWhen: 'is this secure, security audits, pre-launch passes', source: 'user', tags: ['security', 'threat', 'audit'], triggers: ['security audit', 'vulnerability', 'threat model', 'is this secure', 'security review', 'pen test', 'owasp'] },
        { name: 'database-and-migrations', slug: 'database-migrations', desc: 'Schema design, zero-downtime expand-migrate-contract, indexing, N+1.', useWhen: 'adding tables/columns, writing/reviewing migrations, or slow queries', source: 'user', tags: ['database', 'migrations', 'sql'], triggers: ['database migration', 'schema change', 'add column', 'sql migration', 'slow query', 'n+1', 'index'] },
        { name: 'ci-cd-pipelines', slug: 'ci-cd', desc: 'GitHub Actions authoring, caching, flaky CI, pipeline security, release automation.', useWhen: 'building or debugging CI/CD', source: 'user', tags: ['ci', 'cd', 'github-actions'], triggers: ['github actions', 'ci pipeline', 'cd pipeline', 'flaky test', 'build pipeline', 'workflow yaml'] },
        { name: 'performance-profiling', slug: 'performance', desc: 'Measure-first optimization — profilers, bottleneck classes, honest benchmarks.', useWhen: 'why is this slow, memory leaks, perf regressions', source: 'user', tags: ['performance', 'profiling', 'optimization'], triggers: ['performance', 'slow', 'memory leak', 'profiling', 'bottleneck', 'latency', 'benchmark'] },
        { name: 'git-workflow', slug: 'git-workflow', desc: 'Commit hygiene, interactive rebase, undo table, bisect, branch/tag conventions.', useWhen: 'cleaning up commits, undoing mistakes, writing commit messages', source: 'user', tags: ['git', 'commits', 'rebase'], triggers: ['git rebase', 'commit message', 'git history', 'amend commit', 'git bisect', 'squash commits'] },
      ]
    },
    {
      id: 'agent-engineering',
      name: 'Agent Engineering',
      icon: '🤖',
      color: '#f97316',
      count: 5,
      skills: [
        { name: 'project-development', slug: 'project-development', desc: 'Project-level LLM system decisions — task fit, pipeline shape, cost estimation.', useWhen: 'the unit of work is a whole project or multi-stage pipeline', source: 'user', tags: ['llm', 'project', 'pipeline'], triggers: ['llm project', 'ai pipeline', 'multi-stage', 'cost estimate', 'build with llm'] },
        { name: 'multi-agent-patterns', slug: 'multi-agent', desc: 'Supervisor/swarm coordination, handoffs, when multiple agents are justified.', useWhen: 'designing a multi-agent system or deciding whether to introduce sub-agents', source: 'user', tags: ['multi-agent', 'swarm', 'coordination'], triggers: ['multi-agent', 'agent coordination', 'swarm', 'supervisor agent', 'agent handoff', 'parallel agents'] },
        { name: 'tool-design', slug: 'tool-design', desc: 'Tool descriptions, schemas, error messages, MCP server design.', useWhen: 'the unit of work is a single tool or tool set', source: 'user', tags: ['tools', 'mcp', 'schema'], triggers: ['tool design', 'tool schema', 'function calling', 'tool description', 'mcp design'] },
        { name: 'hosted-agents', slug: 'hosted-agents', desc: 'Sandboxed/background agent infra — warm pools, session persistence.', useWhen: 'designing hosted or remote agent execution environments', source: 'user', tags: ['hosted', 'agents', 'infrastructure'], triggers: ['hosted agent', 'background agent', 'agent infrastructure', 'remote execution', 'warm pool'] },
        { name: 'llm-eval-design', slug: 'llm-eval', desc: 'Eval sets, graders (exact/rubric/LLM-judge), variance handling.', useWhen: 'how do we know it\'s good, building/analyzing evals', source: 'user', tags: ['eval', 'graders', 'benchmarks'], triggers: ['eval', 'evaluation', 'llm judge', 'grader', 'benchmark', 'how good is it', 'measure quality'] },
      ]
    },
    {
      id: 'skill-lifecycle',
      name: 'Skill Lifecycle',
      icon: '📚',
      color: '#a78bfa',
      count: 1,
      skills: [
        { name: 'skill-development', slug: 'skill-development', desc: 'Write skills with TDD pressure-testing, evolve workflow-plan skills, organize the library.', useWhen: 'creating, editing, testing, or reorganizing skills; regenerating this registry', source: 'user', tags: ['skills', 'tdd', 'library'], triggers: ['write a skill', 'update skill', 'skill library', 'organize skills', 'skill registry', 'pressure test skill'] },
      ]
    },
    {
      id: 'massgen',
      name: 'MassGen Project',
      icon: '⚡',
      color: '#e11d48',
      count: 12,
      skills: [
        { name: 'massgen', slug: 'massgen', desc: 'Invoke the multi-agent system on a task.', useWhen: 'user wants multiple agents on writing/code/research', source: 'user', tags: ['massgen', 'multi-agent', 'parallel'], triggers: ['massgen', 'multiple agents', 'parallel agents', 'agent swarm', 'mass generate'] },
        { name: 'massgen-config-creator', slug: 'massgen-config', desc: 'YAML config authoring.', useWhen: 'creating MassGen configs for examples/tests/features', source: 'user', tags: ['massgen', 'yaml', 'config'], triggers: ['massgen config', 'yaml config', 'agent config', 'configure massgen'] },
        { name: 'backend-integrator', slug: 'backend-integrator', desc: 'Add a new LLM provider (~15 files).', useWhen: 'integrating or auditing an LLM backend', source: 'user', tags: ['llm', 'backend', 'integration'], triggers: ['add provider', 'llm backend', 'integrate provider', 'new backend', 'provider integration'] },
        { name: 'multimedia-backend-integrator', slug: 'multimedia-backend', desc: 'Add media backends to generate_media.', useWhen: 'new image/video/audio backend', source: 'user', tags: ['media', 'backend', 'multimedia'], triggers: ['media backend', 'image backend', 'video backend', 'add media provider', 'generate media'] },
        { name: 'model-registry-maintainer', slug: 'model-registry', desc: 'Model/pricing registry upkeep.', useWhen: 'adding models or updating pricing/context data', source: 'user', tags: ['models', 'pricing', 'registry'], triggers: ['update model', 'add model', 'model pricing', 'model registry', 'context window update'] },
        { name: 'textual-ui-developer', slug: 'textual-ui', desc: 'TUI development with replay + snapshot tests.', useWhen: 'developing/debugging the Textual UI', source: 'user', tags: ['tui', 'textual', 'testing'], triggers: ['textual ui', 'tui', 'terminal ui', 'snapshot test', 'textual developer'] },
        { name: 'massgen-log-analyzer', slug: 'log-analyzer', desc: 'Run experiments, analyze logs via SQL/logfire.', useWhen: 'performance analysis or ANALYSIS_REPORT.md needed', source: 'user', tags: ['logs', 'analysis', 'sql'], triggers: ['analyze logs', 'log analysis', 'logfire', 'experiment results', 'performance report'] },
        { name: 'massgen-develops-massgen', slug: 'massgen-self', desc: 'Self-improvement workflows (automation mode / UI evaluation).', useWhen: 'MassGen improving itself', source: 'user', tags: ['massgen', 'self-improvement', 'automation'], triggers: ['massgen self', 'improve massgen', 'self-improvement', 'automation mode', 'ui evaluation'] },
        { name: 'massgen-release', slug: 'massgen-release', desc: 'Full release documentation order + CHANGELOG/announcement automation.', useWhen: 'preparing, documenting, or validating a MassGen release', source: 'user', tags: ['release', 'changelog', 'documentation'], triggers: ['massgen release', 'changelog', 'release notes', 'release announcement', 'version bump'] },
        { name: 'image-generation', slug: 'image-gen', desc: 'Media generation backend guides for images.', useWhen: 'generating/editing images through MassGen', source: 'user', tags: ['image', 'generation', 'media'], triggers: ['generate image', 'image generation', 'create image', 'dalle', 'midjourney', 'stable diffusion'] },
        { name: 'video-generation', slug: 'video-gen', desc: 'Media generation backend guides for video.', useWhen: 'generating/editing video through MassGen', source: 'user', tags: ['video', 'generation', 'media'], triggers: ['generate video', 'video generation', 'create video', 'sora', 'video clip'] },
        { name: 'audio-generation', slug: 'audio-gen', desc: 'Media generation backend guides for audio.', useWhen: 'generating/editing audio through MassGen', source: 'user', tags: ['audio', 'generation', 'media'], triggers: ['generate audio', 'audio generation', 'text to speech', 'voice generation', 'music generation'] },
      ]
    },
  ],

  // Prompt templates for common workflows
  templates: [
    { id: 'skill-invoke', name: 'Invoke a Skill', icon: '⚡', category: 'workflow', prompt: 'Read and follow the [SKILL_NAME] skill. Then:\n\n[TASK_DESCRIPTION]' },
    { id: 'brainstorm-first', name: 'Brainstorm → Build', icon: '💡', category: 'workflow', prompt: 'Read the brainstorming skill. Before we touch any code or artifacts, help me explore:\n\n[INTENT/PROBLEM]' },
    { id: 'plan-then-execute', name: 'Plan → Execute', icon: '📋', category: 'workflow', prompt: 'Read the writing-plans skill. Turn this spec into a complete task-by-task implementation plan:\n\n[SPEC]' },
    { id: 'tdd-cycle', name: 'TDD Cycle', icon: '🔴', category: 'engineering', prompt: 'Follow test-driven-development (RED-GREEN-REFACTOR). For this feature:\n\n[FEATURE DESCRIPTION]\n\nStart with the test cases — what are the failure scenarios?' },
    { id: 'debug-systematic', name: 'Systematic Debug', icon: '🐛', category: 'engineering', prompt: 'Read the systematic-debugging skill. I have a bug:\n\n**Observed behavior:**\n[WHAT IS HAPPENING]\n\n**Expected behavior:**\n[WHAT SHOULD HAPPEN]\n\n**Relevant code/logs:**\n[PASTE HERE]' },
    { id: 'security-audit', name: 'Security Audit', icon: '🔒', category: 'engineering', prompt: 'Read the security-review skill. Perform a full security audit on:\n\n[DESCRIBE SYSTEM / PASTE CODE]\n\nFocus areas: input validation, authentication, authorization, data exposure.' },
    { id: 'massgen-task', name: 'MassGen Multi-Agent', icon: '⚡', category: 'agents', prompt: 'Read the massgen skill. I want to run this task across multiple agents:\n\n[TASK]\n\nSuggest the optimal agent configuration and coordination strategy.' },
    { id: 'context-compress', name: 'Compress Context', icon: '🗜️', category: 'memory', prompt: 'Read the context-compression skill. We\'re approaching the context limit. Create a handoff summary that preserves:\n1. Key decisions made\n2. Current state of work\n3. Next steps\n4. Any critical context a fresh agent needs' },
    { id: 'skill-create', name: 'Create New Skill', icon: '✨', category: 'meta', prompt: 'Read the skill-development skill (Section 1: Writing Skills). I want to create a new skill for:\n\n[DOMAIN/CAPABILITY]\n\nStart with identifying what problem this skill solves and what pressure scenarios we\'d use to test it.' },
    { id: 'code-review-req', name: 'Request Code Review', icon: '👀', category: 'engineering', prompt: 'Read the code-review-workflow skill (Section: requesting review). Review this code for:\n- Security vulnerabilities\n- Performance issues\n- Correctness\n- Code quality\n\n```\n[PASTE CODE]\n```' },
  ],
};

// Flatten all skills for search
SKILLS_DATA.allSkills = SKILLS_DATA.domains.flatMap(d =>
  d.skills.map(s => ({ ...s, domain: d.id, domainName: d.name, domainIcon: d.icon, domainColor: d.color }))
);

// Total count
SKILLS_DATA.totalCount = SKILLS_DATA.allSkills.length;

/**
 * Detect relevant skills for a given input string.
 * Scores each skill by trigger/tag/desc keyword overlap.
 * Returns top N skills sorted by score descending.
 */
SKILLS_DATA.detectSkills = function(inputText, topN = 3) {
  if (!inputText || !inputText.trim()) return [];
  const lower = inputText.toLowerCase();
  const words = lower.split(/\W+/).filter(w => w.length > 2);

  const scored = this.allSkills.map(skill => {
    const triggerSrc = (skill.triggers || []).join(' ').toLowerCase();
    const descSrc = (skill.desc + ' ' + skill.useWhen + ' ' + (skill.tags || []).join(' ')).toLowerCase();

    let score = 0;
    // Trigger phrases (high weight)
    for (const trigger of (skill.triggers || [])) {
      if (lower.includes(trigger.toLowerCase())) score += 3;
    }
    // Individual word matches against triggers
    for (const w of words) {
      if (triggerSrc.includes(w)) score += 1;
      if (descSrc.includes(w)) score += 0.5;
    }
    return { skill, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(s => s.skill);
};
