---
name: git-workflow
description: "Use for day-to-day git craft: commit hygiene and messages, interactive rebase and history editing, undoing mistakes (reset/revert/reflog), bisect, stash, cherry-pick, and branch/tag conventions. Trigger on 'clean up these commits', 'undo', 'I committed to the wrong branch', 'squash', or writing commit messages. Route workspace isolation to using-git-worktrees and merge/PR completion to finishing-a-development-branch."
---

# Git Workflow

The craft between `git init` and the merge: commits worth reading, history worth keeping, and recovery when things go sideways.

## Commit Hygiene

- **One logical change per commit.** A commit should be revertable in isolation and reviewable in one sitting. "Fix bug + drive-by refactor + format pass" is three commits.
- **Every commit should build and pass tests** — this is what makes `git bisect` work later. Stage partially with `git add -p` to split mixed work.
- **Conventional commit messages** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`) when the repo uses them (MassGen does; they feed changelog automation — see `ci-cd-pipelines`). Format:

```
fix(backend): retry on transient 429 from provider

The token manager treated 429 as fatal, killing the whole run.
Retry with exponential backoff up to 3 attempts; surface the
error only after exhaustion.

Fixes #482
```

Subject: imperative mood, ≤72 chars, says *what*; body says *why* and any non-obvious consequence. The diff already shows *how*.

- Never commit: secrets (see `security-review`), generated artifacts, commented-out code, or `WIP` onto a shared branch.

## History Editing (local/unpushed only)

- `git commit --amend` — fix the last commit (message or staged additions).
- `git rebase -i <base>` — reorder, squash (`fixup` for silent squash), reword, drop. Squash "fix typo in previous commit" noise before review; keep genuinely separate changes separate — review-sized commits beat one mega-squash.
- `git commit --fixup <sha>` + `git rebase -i --autosquash` — queue corrections to earlier commits cleanly.
- **The prime directive: never rewrite pushed shared history.** Rewriting your own PR branch is fine (force-push with `--force-with-lease`, never bare `--force`); rewriting main is an incident.

## Undoing Things (choose by what's public)

| Situation | Command |
|---|---|
| Unstage a file | `git restore --staged <f>` |
| Discard uncommitted edits | `git restore <f>` (destructive — no undo) |
| Undo last commit, keep changes | `git reset --soft HEAD~1` |
| Undo last commit, discard changes | `git reset --hard HEAD~1` |
| Undo a *pushed* commit | `git revert <sha>` (new inverse commit — the only safe public undo) |
| Committed to wrong branch | `git branch right-branch` → `git reset --hard HEAD~1` → switch |
| "I destroyed everything" | `git reflog` → find the pre-disaster SHA → `git reset --hard <sha>` |

Reflog retains every HEAD position for ~90 days; almost nothing committed is ever truly lost. Uncommitted work has no such net — commit early on private branches.

## Finding Things

- `git bisect start; git bisect bad; git bisect good <known-good>` — binary-search the breaking commit; `git bisect run <test-cmd>` automates it. Requires the commit hygiene above.
- `git log -S 'symbol'` (pickaxe) — when a string was added/removed; `git log -p -- path` for a file's story; `git blame -w -C` ignores whitespace and follows moves.

## Branch & Sync Discipline

- Short-lived branches off up-to-date main; one branch per logical change. Name `type/short-slug` (`fix/token-retry`).
- Sync a feature branch with `git rebase main` (linear, clean) before review; prefer merge only when the branch is shared with others. Pick the repo's convention and stay consistent.
- Resolve conflicts hunk-by-hunk understanding *both* intents — "take mine" is how regressions ship. `git rerere` (enable it) remembers resolutions across repeated rebases.
- `git stash push -m "context"` for interruptions; stashes older than a day should become WIP commits on a branch — stashes are where work goes to be forgotten.
- Tags: annotated (`git tag -a v0.1.34 -m ...`) for releases; tags trigger release automation (`ci-cd-pipelines`, `massgen-release`).

## Agent-Specific Discipline

- Record `BASE_SHA` before starting multi-commit work; reviews and diffs run against it, never `HEAD~1` (see `code-review-workflow`).
- Commit at each verified checkpoint (after `verification-before-completion` evidence), so any step is individually revertable.
- Before claiming "committed/pushed": show `git log --oneline -3` / `git status` output — the claim requires the evidence.

## Related Skills

- `using-git-worktrees`: parallel isolated checkouts of the same repo.
- `finishing-a-development-branch`: merge/PR/cleanup at the end.
- `ci-cd-pipelines`: automation keyed on branches, tags, and commit conventions.
