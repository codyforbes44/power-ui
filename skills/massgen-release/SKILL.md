---
name: massgen-release
description: MassGen release workflow - documentation (CHANGELOG, Sphinx docs, README, roadmap, case studies, announcements in the required order) and release prep automation (generating CHANGELOG entries, announcement text, and validation before tagging). Use when preparing, documenting, or validating a MassGen release.
license: MIT
---

# MassGen Release

Two sections: **Release Documentation Workflow** (the full ordered documentation process) and **Release Prep Automation** (CHANGELOG/announcement generation and validation before tagging).

# Section 1: Release Documentation Workflow



This skill provides guidance for documenting MassGen releases following the established workflow and conventions.

## Purpose

The release-documenter skill ensures consistent, complete release documentation by guiding you through the full release documentation workflow: CHANGELOG → Sphinx Documentation → README → Roadmap updates.

## When to Use This Skill

Use the release-documenter skill when you need to:

- Prepare documentation for a new release
- Update CHANGELOG.md with new features and fixes
- Write or update Sphinx documentation
- Create case studies for major features
- Update README.md and roadmap documents
- Follow the release checklist process

## Authoritative Documentation

**IMPORTANT:** The primary source of truth for release documentation is:

**📋 `docs/dev_notes/release_checklist.md`**

This file contains:
- Complete phase-by-phase release workflow
- Detailed documentation update requirements
- Validation checklists
- Commit and tag workflow
- Automation tool information
- All current conventions and rules

**Always consult this document** for the complete release process.

## Critical Documentation Order

**Always follow this order:**

0. **Fresh-branch bootstrap** (once, at branch creation) — version bump + rename `ROADMAP_v0.1.X.md` → `ROADMAP_v0.1.X+1.md` (see Phase 0)
1. **CHANGELOG.md** ⭐ START HERE
2. **Version bump** (`massgen/__init__.py` `__version__`)
3. **Sphinx Documentation** (docs/source/)
4. **Config Documentation** (massgen/configs/README.md)
5. **Case Studies** (docs/source/examples/case_studies/)
6. **README.md**
7. **README_PYPI.md** (auto-synced via pre-commit)
8. **Roadmap** (ROADMAP.md)
9. **Announcements** (docs/announcements/) — current-release.md, github-release-vX.md, archive

This order is critical - never skip ahead!

## Quick Reference Workflow

### Phase 0: Fresh Release Branch Bootstrap (do this when the branch is created)

**⚠️ Easy to miss — this happens once, at the *start* of a new `dev/v0.1.X` branch, not at doc-writing time.** When `dev/v0.1.X` is branched (right after the previous release merges in), a small bootstrap commit (`feat: v0.1.X`) sets the branch up:

1. **Bump the version**: `massgen/__init__.py` `__version__ = "0.1.X"` (`pyproject.toml` reads it dynamically).
2. **Roll the forward-looking roadmap file**: rename `ROADMAP_v0.1.X.md` → `ROADMAP_v0.1.X+1.md` and rewrite its content to plan the *next* release. This file always names the version *after* the one currently in development (the in-development version is tracked in the main `ROADMAP.md` sections). Update its title, "Overview", the deferred-feature "Deferred from …" range, and add the just-shipped version(s) to its "Related Tracks" list.

```bash
git mv ROADMAP_v0.1.X.md ROADMAP_v0.1.X+1.md
# then edit __version__ and the renamed roadmap file
```

> If you arrive mid-branch and find `ROADMAP_v0.1.X.md` (matching the in-dev version) still present, or `__version__` still on the previous release, the bootstrap was skipped — do it now before the release docs.

### Phase 1: CHANGELOG.md (Required First Step)

Document all changes under these categories:
- **Added** - New features
- **Changed** - Modified behavior
- **Fixed** - Bug fixes
- **Documentations, Configurations and Resources** - New docs/configs
- **Technical Details** - Contributors, focus areas

```bash
# Get changes since last release
git log v0.1.X-1..HEAD --oneline
gh pr list --base dev/v0.1.X --state merged
```

See `docs/dev_notes/release_checklist.md` sections 3.1 for detailed format.

### Phase 2: Sphinx Documentation

Update as needed:
- `docs/source/index.rst` - Recent Releases section (keep latest 3)
- `docs/source/user_guide/` - New feature guides
- `docs/source/reference/yaml_schema.rst` - New YAML parameters
- `docs/source/reference/supported_models.rst` - New models

**Build and verify:**
```bash
cd docs && make html
make linkcheck  # Verify no broken links
```

See `docs/dev_notes/release_checklist.md` section 3.2 for complete requirements.

### Phase 3: Config Documentation

- Update `massgen/configs/README.md`
- Create example configs in appropriate category
- Test all new configs

### Phase 4: Case Studies

```bash
# Use template
cp docs/source/examples/case_studies/case-study-template.md \
   docs/source/examples/case_studies/v0.1.X-feature-name.md

# Update index
vim docs/source/examples/case_studies.rst
```

See `docs/dev_notes/release_checklist.md` section 3.4.

### Phase 5: README.md

Update these sections:
1. **Recent Achievements** (move old to Previous Achievements)
2. **Case Studies** section
3. **Configuration Files** (if structure changed)

Copy format from CHANGELOG.md and expand.

### Phase 6: README_PYPI.md (Automated)

**✅ Auto-synced via pre-commit hook!**

When you commit README.md changes:
1. Pre-commit hook runs automatically
2. README_PYPI.md gets synced
3. If hook shows "Failed - files were modified", run `git commit` again

Manual sync if needed:
```bash
uv run python scripts/sync_readme_pypi.py
```

### Phase 7: Roadmap

- Mark completed features as ✅ in `ROADMAP.md`
- Update `ROADMAP_v0.1.X+1.md` for next release
- Do NOT edit `docs/source/development/roadmap.rst` (auto-generated)

### Phase 8: Announcements (`docs/announcements/`)

**⚠️ Easy to miss — not auto-generated.** Each release rotates three things in `docs/announcements/`:

1. **Archive the outgoing announcement**: copy the current `current-release.md` to `archive/v0.1.X-1.md` (the version it currently describes).
   ```bash
   cp docs/announcements/current-release.md docs/announcements/archive/v0.1.X-1.md
   ```
2. **Rewrite `current-release.md`** for the new version: update the title, Release Summary, Install version, release-notes link, "Suggested image" version, and the full LinkedIn announcement body (Key Improvements bullets). This is the long-form social/LinkedIn copy.
3. **Replace the GitHub-release highlights file**: delete `github-release-v0.1.X-1.md` and create `github-release-v0.1.X.md` (the short, emoji-sectioned GitHub Releases body dated `(YYYY-MM-DD)`).
   ```bash
   git rm docs/announcements/github-release-v0.1.X-1.md
   # then write docs/announcements/github-release-v0.1.X.md
   ```

`feature-highlights.md` and `README.md` in that directory are general (not per-version) — leave them unless the highlights changed.

Use the just-archived previous version's files as templates so the structure/sections stay consistent. Keep `[TO BE ADDED AFTER POSTING]` placeholders for the X/LinkedIn links.

> **Don't forget the version bump** (`massgen/__init__.py` `__version__ = "0.1.X"`) — `pyproject.toml` reads the version dynamically from there.

## Quick Validation Checklist

**Must Update (every release):**
0. ✅ Fresh-branch bootstrap done? (`__version__` bumped + `ROADMAP_v0.1.X.md` → `ROADMAP_v0.1.X+1.md` renamed — see Phase 0)
1. ✅ CHANGELOG.md
2. ✅ `massgen/__init__.py` (`__version__` bump)
3. ✅ docs/source/index.rst (Recent Releases)
4. ✅ README.md (Recent Achievements + Latest Features + TOC anchors)
5. ✅ ROADMAP.md (Current Version, completed section, table)
6. ✅ docs/announcements/ (archive old, rewrite current-release.md, swap github-release-vX.md)
7. ⚠️ docs/source/user_guide/ (if user-facing feature)
8. ⚠️ massgen/configs/ (example configs, if any)
9. ⚠️ Case study (skip for internal-quality/no-user-facing-feature releases)

**Should Update (if applicable):**
10. ⚠️ massgen/config_builder.py (if config params added)
11. ⚠️ massgen/backend/capabilities.py (if backend changes)
12. ✅ README_PYPI.md (auto-synced from README.md via pre-commit)

**Build & Verify:**
13. 🔨 `cd docs && make html && make linkcheck`
14. 🔨 Test new config files
15. 🔨 Verify all links work

See `docs/dev_notes/release_checklist.md` section "Quick Reference Checklist" for complete list.

## Backend Updates (When Needed)

### Config Builder

If new YAML parameters were added, update `massgen/config_builder.py`:
- Add parameters to interactive wizard
- Update validation
- Add help text
- Test with `massgen --config-builder`

### Backend Capabilities

If backend capabilities changed, update `massgen/backend/capabilities.py`:
- Document which backends support new features
- Update capability matrix
- Add new capability flags

See `docs/dev_notes/release_checklist.md` section 2.1-2.2.

## Commit and Release Workflow

### Commit Message Template

```bash
git commit -m "docs: Release v0.1.X documentation

- Updated CHANGELOG.md with full release notes
- Added case study: [Feature Name]
- Updated README.md Recent Achievements
- Enhanced Sphinx documentation
- Added example configurations

Major features:
- Feature 1: Description
- Feature 2: Description
"
```

### Create PR

```bash
git push origin dev/v0.1.X

gh pr create --base main --head dev/v0.1.X \
  --title "Release v0.1.X: [Feature Name]" \
  --body "See CHANGELOG.md for full release notes"
```

### Tag Release (After Merge)

```bash
git checkout main && git pull

git tag -a v0.1.X -m "Release v0.1.X: [Feature Name]

Major features:
- Feature 1
- Feature 2

See CHANGELOG.md for details."

git push origin v0.1.X
```

See `docs/dev_notes/release_checklist.md` section 7 for complete workflow.

## Reference Files

**Primary Documentation:**
- **Release checklist**: `docs/dev_notes/release_checklist.md` ⭐ START HERE
- **Writing configs**: `docs/source/development/writing_configs.rst`

**Scripts:**
- **README sync**: `scripts/sync_readme_pypi.py`
- **Config validation**: `scripts/precommit_validate_configs.py`
- **Backend tables**: `docs/scripts/generate_backend_tables.py`

**Templates:**
- **Case study template**: `docs/source/examples/case_studies/case-study-template.md`

## Tips for Agents

When preparing release documentation:

1. **Always read the release checklist first**: `docs/dev_notes/release_checklist.md`
2. **Follow the order strictly**: CHANGELOG → Sphinx → README → Roadmap
3. **Build docs after changes**: `cd docs && make html && make linkcheck`
4. **Test all new configs** before committing
5. **When in doubt**, consult `docs/dev_notes/release_checklist.md` for complete guidance

This skill is a quick reference guide. For comprehensive, step-by-step instructions, always refer to the official release checklist document.

# Section 2: Release Prep Automation



This skill automates release preparation for MassGen, generating CHANGELOG entries, announcement text, and validating documentation.

## When to Use

Run this skill when preparing a new release:
- After merging the release PR to main
- Before creating the git tag

## Usage

```
/release-prep v0.1.34
```

## What This Skill Does

### 1. Gather Changes

Read commits and PRs since the last tag:

```bash
# Get last tag
git describe --tags --abbrev=0

# Get commits since last tag
git log v0.1.33..HEAD --oneline

# Get merged PRs (if using GitHub)
gh pr list --base main --state merged --search "merged:>2024-01-01"
```

### 2. Archive Previous Announcement

If `docs/announcements/current-release.md` exists:

```bash
# Extract version from current-release.md
VERSION=$(grep -m1 "^# MassGen v" docs/announcements/current-release.md | sed 's/# MassGen v\([^ ]*\).*/\1/')

# Archive it
mv docs/announcements/current-release.md docs/announcements/archive/v${VERSION}.md
```

### 3. Generate CHANGELOG Entry

**Update the Recent Releases section** at the top of `CHANGELOG.md`:
- Add the new release summary at the top
- Keep only the **3 newest releases** in this section
- Remove older entries (they remain in the detailed changelog below)

Create a structured entry following Keep a Changelog format:

```markdown
## [0.1.34] - YYYY-MM-DD

### Added
- **Feature Name**: Description
  - Implementation details

### Changed
- **Modified Feature**: What changed

### Fixed
- **Bug #123**: Description of fix

### Documentations, Configurations and Resources
- **Feature Guide**: New `docs/source/user_guide/feature.rst` for feature usage
- **Design Document**: New `docs/dev_notes/feature_design.md` for implementation details
- **Updated Docs**: Updated `docs/source/reference/cli.rst` with new commands
- **Skills**: New `massgen/skills/skill-name/SKILL.md` for automation
```

**Documentation section rules:**
- Reference specific file paths (`.rst`, `.md`, `.yaml` files)
- Use "New" for newly added files, "Updated" for modified files
- Run `git diff <last-tag>..HEAD --name-only -- "*.md" "*.rst" "*.yaml"` to find changed docs

**Categorization rules:**
- `feat:` commits → Added
- `fix:` commits → Fixed
- `docs:` commits → Documentation
- `refactor:`, `perf:` commits → Changed
- Breaking changes → highlight with ⚠️

**Contributors:**
- Run `git shortlog -sn <last-tag>..HEAD` to find all contributors
- List contributors by commit count in the Technical Details section

### 4. Update Sphinx Documentation

Update `docs/source/index.rst` Recent Releases section:

```bash
# Update Recent Releases section (keep latest 3 releases)
# Add new release at top, remove oldest (v0.1.X-3)
```

**Format:**
```rst
Recent Releases
---------------

**v0.1.44 (January 28, 2026)** - Execute Mode for Independent Plan Selection

New Execute mode for cycling through Normal → Planning → Execute modes via ``Shift+Tab``. Users can independently browse and select from existing plans with a plan selector popover. Context paths preserved between planning and execution phases. Enhanced case studies page with setup guides and quick start instructions.

**v0.1.43 (January 26, 2026)** - Tool Call Batching & Interactive Case Studies

...

**v0.1.42 (January 23, 2026)** - TUI Visual Redesign

...
```

Keep only the 3 most recent releases in this section. Older releases remain in the full changelog.

### 5. Update Configs Documentation

Update `massgen/configs/README.md` Release History section:

```markdown
## Release History & Examples

### v0.1.44 - Latest
**New Features:** Execute Mode for Independent Plan Selection, Case Studies UX Enhancements

**Key Features:**
- **Execute Mode Cycling**: Navigate through Normal → Planning → Execute modes via `Shift+Tab`
- **Plan Selector Popover**: Browse and select from up to 10 recent plans with timestamps
- **Context Path Preservation**: Context paths automatically preserved between planning and execution
- **Enhanced Case Studies**: Setup guides and quick start instructions on case studies page

**Example Usage:**
```bash
# Use the TUI with plan mode cycling
massgen --config @examples/basic/multi/three_agents_default

# In the TUI:
# 1. Press Shift+Tab to enter Planning mode
# 2. Create a plan: "Create a Python web scraper for news articles"
# 3. Press Shift+Tab twice to enter Execute mode
# 4. Select your plan from the popover and press Enter to execute
```
```

### 6. Update README.md

#### 6.1 Latest Features Section

Update the "🆕 Latest Features" section:

```markdown
## 🆕 Latest Features (v0.1.44)

**🎉 Released: January 28, 2026**

**What's New in v0.1.44:**
- **🔄 Execute Mode** - Cycle through Normal → Planning → Execute modes via `Shift+Tab` to independently browse and execute existing plans
- **📋 Plan Selector** - Browse up to 10 recent plans with timestamps, view full task breakdowns, and execute with preserved context paths
- **📚 Enhanced Case Studies** - Interactive setup guides and quick start instructions on case studies page
- **⚡ TUI Performance** - Optimized timeline rendering with viewport-based scrolling for faster UI responsiveness
- **🔧 Plan Mode Fixes** - Fixed planning instruction injection bug in execute mode, improved tool tracking

**Try v0.1.44 Features:**
```bash
# Install or upgrade
pip install --upgrade massgen

# Experience Execute mode with plan cycling
uv run massgen --display textual

# In the TUI:
# 1. Press Shift+Tab to enter Planning mode
# 2. Create a plan: "Build a Python web scraper"
# 3. Press Shift+Tab twice to enter Execute mode
# 4. Select your plan and press Enter to execute
```
```

Also update the table of contents link from v0.1.43 → v0.1.44.

#### 6.2 Recent Achievements Section

Move the current "Recent Achievements" to "Previous Achievements" and add new release:

```markdown
### Recent Achievements (v0.1.44)

**🎉 Released: January 28, 2026**

#### Execute Mode for Independent Plan Selection
- **Mode Cycling**: Navigate through Normal → Planning → Execute modes via `Shift+Tab` or mode bar click
- **Plan Selector Popover**: Browse up to 10 recent plans with timestamps and original prompts
- **View Full Plan**: Modal displays complete task breakdown from selected plan
- **Empty Submission**: Press Enter to execute selected plan without additional input
- **Context Path Preservation**: Context paths (`@/path/to/file`) automatically restored from planning to execution phase

...

### Previous Achievements (v0.0.3 - v0.1.43)

✅ **Tool Call Batching & Interactive Case Studies (v0.1.43)**: Consecutive MCP tool calls grouped into collapsible tree views...
```

Also update roadmap TOC links:
- `[Recent Achievements (v0.1.43)]` → `[Recent Achievements (v0.1.44)]`
- `[Previous Achievements (v0.0.3 - v0.1.42)]` → `[Previous Achievements (v0.0.3 - v0.1.43)]`
- `[v0.1.44 Roadmap]` → `[v0.1.45 Roadmap]`

Update the roadmap section at bottom to reference next version (v0.1.45).

### 7. Update ROADMAP.md

Update the main roadmap file:

#### 7.1 Version and Date
```markdown
**Current Version:** v0.1.44

**Last Updated:** January 28, 2026
```

#### 7.2 Release Table

Shift all releases down and add new next release:

```markdown
| Release | Target | Feature | Owner | Use Case |
|---------|--------|---------|-------|----------|
| **v0.1.45** | 01/30/26 | Improve Subagent Display in TUI | @ncrispino | Stream and view subagents with full timeline in TUI ([#821](...)) |
| **v0.1.46** | 02/02/26 | Next feature | @owner | Use case |
```

#### 7.3 Add Completed Section

Add the just-released version as COMPLETED:

```markdown
## ✅ v0.1.44 - Execute Mode & Case Studies Enhancement (COMPLETED)

**Released: January 28, 2026**

### Features

- **Execute Mode**: Independent mode for browsing and executing existing plans ([#819](...))
  - Cycle through Normal → Planning → Execute modes via `Shift+Tab`
  - Plan selector popover shows up to 10 recent plans with timestamps
  - "View Full Plan" button opens modal with all tasks
  - Empty submission executes selected plan
  - Context paths preserved from planning to execution phase

...

### Bug Fixes
- Fixed planning instruction injection during execute mode
- Improved tool call spacing in TUI
- Enhanced timeline performance with viewport optimization
```

#### 7.4 Update Next Release Section

Change the header for the upcoming release:

```markdown
## 📋 v0.1.45 - Improve Subagent Display in TUI

### Features

**1. Subagent TUI Streaming** (@ncrispino)
- Issue: [#821](...)
- Stream and display subagents almost identically to main process in TUI
...
```

### 8. Create Next Release Roadmap

Create `ROADMAP_v0.1.X+1.md` with detailed milestones:

```markdown
# MassGen v0.1.45 Roadmap

## Overview

Version 0.1.45 focuses on [MAIN THEME].

- **Feature 1** (Required): Description
- **Feature 2** (Required): Description

## Key Technical Priorities

1. **Feature 1**: Details
   **Use Case**: Why this matters

2. **Feature 2**: Details
   **Use Case**: Why this matters

## Key Milestones

### Milestone 1: [Feature Name] (REQUIRED)

**Goal**: What we're building

**Owner**: @username (discord)

**Issue**: [#XXX](...)

#### 1.1 Research & Design
- [ ] Task 1
- [ ] Task 2

#### 1.2 Implementation
- [ ] Task 1
- [ ] Task 2

...

**Success Criteria**:
- Criteria 1
- Criteria 2
```

Look at the GitHub issues, especially those tagged with the next milestone, to populate the roadmap.

### 9. Build Sphinx Documentation

Build and verify the Sphinx docs:

```bash
cd docs
make clean
make html
```

Check for:
- ❌ No build errors
- ❌ No broken links
- ⚠️ Minimal warnings (document unavoidable ones)
- ✅ New content renders correctly

Optional: Run link checker:
```bash
cd docs
make linkcheck
```

### 10. Write Release Notes

Create `RELEASE_NOTES_v0.1.X.md` following the established format from previous releases.

**Format reference:** Check the previous release on GitHub:
```bash
gh release view v0.1.43
```

**Template structure:**
```markdown
# 🚀 Release Highlights — v0.1.X (YYYY-MM-DD)

### 🎯 [Feature Name](https://docs.massgen.ai/en/latest/path/to/docs.html)
- **Bullet Point**: Description
- **Bullet Point**: Description

### 📚 [Another Feature](https://docs.massgen.ai/en/latest/path/to/docs.html)
- **Bullet Point**: Description

### 🔧 Bug Fixes
- **Fix Description**: What was fixed

---

### 📖 Getting Started
- [**Quick Start Guide**](https://github.com/massgen/MassGen?tab=readme-ov-file#1--installation): Try the new features today
- **Try Feature Name**:

```bash
# Example command showing the new feature
uv run massgen [example command]
```

## What's Changed
* PR title by @author in PR_URL
* PR title by @author in PR_URL

**Full Changelog**: https://github.com/massgen/MassGen/compare/v0.1.X-1...v0.1.X
```

**Get PRs for What's Changed:**
```bash
gh pr list --base dev/v0.1.X --state merged --json number,title,url,author \
  | jq -r '.[] | "* \(.title) by @\(.author.login) in \(.url)"'
```

**Important:**
- Use emoji section headers (🚀 🔄 📚 ⚡ 🔧 📖)
- Link feature names to relevant docs (verify links are accurate!)
- Include practical example commands
- List all merged PRs in "What's Changed"
- Add "Full Changelog" comparison link

### 11. Generate Announcement

Create `docs/announcements/current-release.md`:

```markdown
# MassGen vX.X.X Release Announcement

## Release Summary

We're excited to release MassGen vX.X.X, adding [MAIN FEATURE]! 🚀

[2-3 sentences describing the key changes]

## Install

\`\`\`bash
pip install massgen==X.X.X
\`\`\`

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/vX.X.X
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]
```

### 12. Validate Documentation

Check that required documentation exists:

```bash
# Check for user guide updates (if new features)
ls docs/source/user_guide/

# Check capabilities.py updated (if new models)
git diff v0.1.33..HEAD -- massgen/backend/capabilities.py

# Check token_manager.py (if pricing changes)
git diff v0.1.33..HEAD -- massgen/token_manager/token_manager.py

# Check for case study
ls docs/source/examples/case_studies/
```

### 13. Character Count Check

Verify announcement fits LinkedIn's ~3000 char limit:

```bash
# Count characters
cat docs/announcements/current-release.md docs/announcements/feature-highlights.md | wc -m

# Should be < 3000
```

### 14. Suggest Screenshot/Media

Based on the changes in this release, suggest what screenshot or GIF to capture:

**Feature-to-Screenshot Mapping:**

| Change Type | Screenshot Suggestion |
|-------------|----------------------|
| New backend/model support | Terminal showing agent using new model with successful response |
| Multi-agent coordination | Multiple agents working in parallel with colored output |
| Voting/consensus | Voting phase with agent decisions and final selection |
| MCP tools | Tool execution with visible results (file ops, search, etc.) |
| Context compression | Log output showing compression stats and message counts |
| Memory/persistence | Agent recalling context from previous session |
| Web UI changes | Dashboard with agent activity or new UI feature |
| Cost tracking | Summary showing token usage and costs per agent |
| Error handling | Agent gracefully recovering from failure |
| Performance improvements | Before/after timing or throughput comparison |
| New config options | YAML config snippet with new options highlighted |

**Analysis approach:**

1. Look at the main features from commits
2. Identify the most visually compelling change
3. Suggest specific command to run that demonstrates the feature
4. Note if a GIF (via VHS) would be better than a static screenshot

**Example output:**

```
### 📸 Suggested Screenshot for v0.1.34

Based on this release's changes, recommend capturing:

**Primary:** GPT-5 model support
- Run: `massgen --config massgen/configs/providers/openai/gpt5_demo.yaml "Explain quantum computing"`
- Capture: Terminal showing GPT-5 model name in agent output with response

**Alternative:** Context compression improvements
- Run: `massgen --automation --config [long-context-config] "question" | grep compression`
- Capture: Log output showing reduced token counts

**Media type:** Static screenshot is fine (no complex animation needed)
```

### 15. Output Summary

Print a checklist:

```
## Release Prep Summary for v0.1.34

✅ Archived previous announcement → archive/v0.1.33.md
✅ Updated CHANGELOG.md with v0.1.34 entry
✅ Updated docs/source/index.rst Recent Releases
✅ Updated massgen/configs/README.md Release History
✅ Updated README.md Latest Features section
✅ Updated README.md Recent Achievements section
✅ Updated ROADMAP.md (current version, release table, completed section)
✅ Created ROADMAP_v0.1.35.md for next release
✅ Built Sphinx documentation successfully
✅ Created current-release.md
✅ Character count: 2847/3000

### Manual Steps Remaining:
1. Review all updated files for accuracy
2. Capture suggested screenshot (see below)
3. Stage and commit changes
4. Push and create PR to main
5. After merge: Create tag (git tag v0.1.34 && git push origin v0.1.34)
6. Publish GitHub Release (triggers PyPI publish)
7. Post to LinkedIn/X with screenshot, update links in current-release.md

### 📸 Screenshot Suggestion:
[Feature-specific suggestion based on changes]

### Validation Warnings:
⚠️ No case study found for this release
⚠️ capabilities.py was modified - verify docs updated
⚠️ README_PYPI.md will auto-sync via pre-commit hook
```

## Reference Files

### Documentation Files
- **CHANGELOG:** `CHANGELOG.md` - Complete release history
- **Sphinx docs homepage:** `docs/source/index.rst` - Recent Releases section
- **Configs README:** `massgen/configs/README.md` - Release History & Examples
- **Main README:** `README.md` - Latest Features and Recent Achievements
- **Main Roadmap:** `ROADMAP.md` - Current version, release table, completed releases
- **Next Release Roadmap:** `ROADMAP_v0.1.X+1.md` - Detailed milestones for next version

### Announcement Files
- **Announcement directory:** `docs/announcements/`
- **Current release:** `docs/announcements/current-release.md`
- **Feature highlights:** `docs/announcements/feature-highlights.md`
- **Archive:** `docs/announcements/archive/` - Past releases

### Process Documentation
- **Release checklist:** `docs/dev_notes/release_checklist.md` - Complete step-by-step guide
- **README sync:** `README_PYPI.md` - Auto-synced via pre-commit hook

## Tips

- Run this skill on the release branch (e.g., `dev/v0.1.44`) before creating the PR
- Always review all generated content for accuracy before committing
- Update `feature-highlights.md` if this release adds major new capabilities
- After posting to social media, update the links in `current-release.md`
- README_PYPI.md syncs automatically via pre-commit hook - just commit README.md changes
- Keep Recent Releases sections to 3 entries max (Sphinx docs, CHANGELOG top section)
- Use GitHub issue numbers in roadmap updates for traceability
- Build Sphinx docs (`cd docs && make html`) to catch formatting issues early
