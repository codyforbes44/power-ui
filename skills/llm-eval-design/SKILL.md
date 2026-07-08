---
name: llm-eval-design
description: "Use when designing or analyzing evaluations for LLM systems: building eval sets, choosing graders (exact match, rubric, LLM-as-judge), pass@k and variance handling, avoiding contamination and Goodharting, and reading eval results honestly. Trigger on 'how do we know the model/agent is good', 'build an eval', 'benchmark this prompt/agent', or regression-testing LLM behavior. Route skill-file pressure-testing to skill-development and dataset statistics to data-analysis."
---

# LLM Eval Design

Turning "does it work?" into a number you can trust — for prompts, agents, pipelines, and model choices. The core discipline: an eval is a *measurement instrument*, and instruments need validity (measures the right thing), reliability (same answer twice), and sensitivity (detects the changes you care about).

## Start From the Decision

Name the decision the eval will drive: "ship prompt B over A", "Haiku suffices for this stage", "the agent regressed". Then work backwards to the minimum instrument that decides it. Evals built without a decision in mind become dashboards nobody trusts.

## Building the Eval Set

- **Source from reality**: harvest real failures and real inputs from logs (see `massgen-log-analyzer` for MassGen) before inventing synthetic cases. Synthetic cases test what you imagined; logged cases test what happens.
- **Stratify deliberately**: easy cases (regression floor), representative cases (the mean), hard/adversarial cases (the frontier), and out-of-scope cases where the correct behavior is refusal or escalation. Report per-stratum, not just overall — a 5-point overall gain that's entirely easy-stratum is a different fact than a hard-stratum gain.
- **Size for the deltas you must detect.** With binary pass/fail, distinguishing 80% from 85% needs ~hundreds of items; 30 items can only detect huge effects. If you can't afford the set size, widen the effect (compare more-different variants) or accept directional-only conclusions.
- **Hold out**: the moment you iterate prompts against an eval set, it becomes a training set. Keep a untouched holdout for final claims; refresh cases periodically to fight contamination and drift.
- Every case: input, grading criteria, and *provenance* (where it came from, why it's in the set).

## Choosing the Grader

In order of preference — use the cheapest grader the task admits:

1. **Programmatic/exact**: string match, regex, unit tests on generated code, schema validation, tool-call assertions. Deterministic and free; restructure tasks to enable it where possible (ask for JSON, ask for the final number on its own line).
2. **Reference-based fuzzy**: normalized match, numeric tolerance, set overlap.
3. **Rubric + LLM-as-judge**: for open-ended quality. Non-negotiables:
   - Rubric with concrete, binary-decidable criteria — "cites the correct file (Y/N)", not "is helpful (1–10)". Decompose quality into 3–7 such checks; score = fraction passed.
   - **Calibrate the judge**: grade 20–30 cases yourself, measure judge–human agreement; below ~85–90% agreement, fix the rubric before trusting the judge.
   - Judge model ≠ generator model where feasible (self-preference bias); randomize A/B position (position bias); hide which variant is which.
   - Pin the judge model + prompt version; a judge upgrade mid-project invalidates cross-time comparisons.
4. **Human grading**: reserve for calibration sets and final ship decisions.

## Running: Variance Is the Enemy

- LLMs are stochastic even at temperature 0 (and agents wildly more so). Run **k trials per case**; report mean with a confidence interval, or pass@k / pass^k as the decision demands (pass@k for "can it ever", pass^k for "does it reliably").
- Compare variants on the **same cases, same seeds where possible**, and use paired statistics — per-case win/loss is far more sensitive than comparing two overall means.
- Agent evals: grade the **outcome** (end state — files, tests green, task artifacts), not the transcript vibes; additionally assert on cost/turn budgets, since a variant that passes at 3× the tokens is a different product.
- Keep every run's raw transcripts (`filesystem-context`); tomorrow's question is always "show me the failures".

## Reading Results Honestly

- **Look at the failures before the score.** 15% failure that is one systematic bug is great news (fixable); 15% diffuse randomness is the real 15%. Categorize failure modes; the categorization is usually worth more than the number.
- A score moved: is it inside the CI? Did the strata shift or the capability? Did any *previously passing* case regress (report regressions separately — users experience regressions, not averages)?
- **Goodhart check** on every metric: how would a degenerate policy max this? (Judge rewards length → verbosity creep; pass = "no error" → empty outputs.) Pair each target metric with a guard metric (length cap, cost cap, regression count).
- Never claim from an eval more than its set supports: "improves on our 200-case support-ticket set" is the honest scope of the sentence.

## Lifecycle

Wire the eval into CI as a regression gate (subset on PR, full nightly — `ci-cd-pipelines`); every production failure becomes a new case; re-baseline and re-calibrate the judge whenever models change. An eval that isn't maintained decays into a green light that means nothing.

## Related Skills

- `skill-development`: pressure-testing skills with subagents is a specialized eval of this kind.
- `data-analysis`: statistical machinery for comparing runs.
- `project-development` / `massgen-log-analyzer`: where eval results feed model/pipeline choices.
