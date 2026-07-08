---
name: ci-cd-pipelines
description: "Use when building or debugging automation pipelines: GitHub Actions workflows, pre-commit hooks, build/test/release automation, caching, flaky CI, and pipeline security. Trigger on 'CI is failing', 'add a workflow', 'automate the release', or 'works locally but not in CI'. Route what to verify before shipping to engineering:deploy-checklist — this skill is about building the automation itself."
---

# CI/CD Pipelines

Authoring and debugging the automation that builds, tests, and ships code. Focus is GitHub Actions (the patterns transfer to GitLab CI/CircleCI).

## Pipeline Design Principles

- **Fail fast, cheapest first.** Order jobs: lint/typecheck → unit tests → build → integration/e2e. A 30-second lint failure shouldn't wait behind a 20-minute e2e suite.
- **Deterministic or it's worthless.** Pin action versions (`actions/checkout@v4`, or full SHA for third-party actions), pin toolchain versions, install from lockfiles (`npm ci`, `pip install -r` with hashes, `--frozen-lockfile`).
- **Every step's failure must be diagnosable from its log.** Echo versions and key env at the start; upload artifacts (test reports, screenshots, build outputs) on failure, not just success.
- **PR pipeline = merge pipeline.** If main runs different checks than PRs, main will break. Same workflow, different triggers.

## GitHub Actions Essentials

```yaml
on:
  pull_request:
  push: { branches: [main] }
concurrency:                      # cancel superseded runs
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15           # ALWAYS set; default is 6 hours
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npm test
```

- **Caching**: cache package-manager stores keyed on the lockfile hash (`hashFiles('**/package-lock.json')`); use `restore-keys` prefixes for partial hits. Cache dependencies, not build outputs, unless outputs are content-addressed.
- **Matrix** builds for version/OS coverage; `fail-fast: false` when you want the full picture.
- **Path filters** (`paths:`) to skip irrelevant work in monorepos; a required check that's path-skipped needs a no-op satisfier or merge queues stall.
- **Reusable workflows** (`workflow_call`) and composite actions to deduplicate; more than two copies of a step sequence means extract it.

## Pipeline Security

- Least-privilege token: set top-level `permissions: contents: read` and grant per-job additions explicitly.
- `pull_request_target` and any workflow with secrets must never check out and execute PR-author code. This is the classic exfiltration hole.
- Untrusted input (PR titles, branch names, issue bodies) never interpolates into `run:` — pass through `env:` instead: `run: echo "$TITLE"` with `env: TITLE: ${{ github.event.pull_request.title }}`.
- Secrets: environment-scoped, never echoed, never in build args that end up in image layers. OIDC to cloud providers over long-lived keys.

## Debugging CI Failures

1. **Read the actual failing step's log**, not the summary. Expand the first error, not the last — later failures cascade.
2. **"Works locally"** almost always means an environment delta: OS, tool version, missing env var, dirty local state (untracked files, global installs), timezone/locale, or test-order dependence. Reproduce with the same container image locally (`act`, or `docker run` the runner image) before guessing.
3. **Flaky tests**: quarantine visibly (tagged and reported), never silently retried forever. Root causes are usually timing waits (fix with condition-based waiting — see `systematic-debugging`), shared state between tests, or port/resource collisions in parallel runs.
4. **Cache poisoning**: when behavior differs inexplicably between runs, bust the cache key once before deeper archaeology.

## Release Automation

- Tag-triggered release workflows: build once, then promote the same artifact through environments — never rebuild per environment.
- Generate changelog/release notes from conventional commits or PR labels (see `git-workflow`); for MassGen specifically, `massgen-release` owns the documentation sequence.
- Gate production deploys with GitHub environments (required reviewers, wait timers); keep the rollback path (`deploy previous tag`) as automated as the forward path.

## Pre-commit Hooks

- Hooks catch fast, mechanical issues (format, lint, secrets scan); anything slow belongs in CI, or developers will `--no-verify`.
- CI must run the same hooks (`pre-commit run --all-files`) — hooks that only run locally are suggestions.

## Related Skills

- `engineering:deploy-checklist`: what to verify at ship time; this skill builds the machinery that enforces it.
- `git-workflow`: branch/tag/commit conventions the pipeline keys off.
- `verification-before-completion`: green CI is evidence — claiming "CI passes" requires having seen the run.
