---
name: data-analysis
description: "Use when analyzing datasets with code: exploring CSVs/JSON/parquet with pandas, statistical summaries, hypothesis checks, plotting with matplotlib/plotly, and communicating findings honestly. Covers exploration workflow, common data traps, and chart choice. Route spreadsheet-file deliverables to the xlsx skill and interactive artifact dashboards to web-artifacts-builder."
---

# Data Analysis

Workflow and judgment for analyzing tabular data with code. The deliverable is understanding (findings, charts, a verdict), not a spreadsheet file — if the user wants an .xlsx back, use the `xlsx` skill for the output step.

## Workflow

**1. Inspect before analyzing.** Never trust a file's claimed structure:

```python
df = pd.read_csv(path)
df.shape; df.dtypes; df.head(10)
df.isna().sum()                      # missingness per column
df.describe(include="all")
df.duplicated().sum()
```

Look for: header rows mid-file, mixed types in one column (numbers stored as strings, "N/A"/"-" sentinels), date columns parsed as objects, duplicated keys, and unit inconsistencies.

**2. State the question before touching aggregations.** "What does the data say?" is not a question. Turn the request into something falsifiable: "did revenue per region change after March?" Every groupby should trace back to it.

**3. Clean with an audit trail.** Keep raw data immutable; derive cleaned frames. Log every row you drop and why (`n_before`, `n_after`, reason). Silent row loss is the most common source of wrong conclusions.

**4. Analyze at the right granularity.** Aggregate too early and you can't slice later; too late and you drown. Standard sequence: overall → by the 1–2 dimensions the question names → by time if temporal.

**5. Sanity-check every result.** Before reporting a number: does the total reconcile with a raw count? Does the trend survive removing the top outlier? Is the denominator what you think it is? One reconciliation check catches most join and filter bugs.

## Common Traps

- **Joins that multiply rows.** After any merge, assert the row count matches expectation (`validate="one_to_one"` / `"many_to_one"` in pandas).
- **Simpson's paradox.** An aggregate trend can reverse within every subgroup. If groups differ in size, check the disaggregated view before concluding.
- **Survivorship in the file itself.** Ask what rows *couldn't* be in this dataset (churned customers, failed requests) before generalizing.
- **Percentage-of-what errors.** Always name the denominator in the finding, not just the percentage.
- **Timezone and period-boundary drift.** Daily aggregates shift by a day across timezones; month-to-date comparisons need same-day-of-month alignment.
- **p-hacking by exploration.** If you sliced 20 ways and one is "significant", that's expected noise. Report how many cuts were examined.

## Statistics: Minimum Honest Kit

- Report **effect size with uncertainty**, not just direction: "up 12% (95% CI 4–20%)" beats "increased".
- Medians and IQR for skewed data (latency, revenue, counts); means hide tails.
- For A/B-style comparisons: check group sizes, use a two-proportion or t/Mann-Whitney test as appropriate, and state assumptions. Don't reach for tests the question doesn't need.
- Correlation claims require a scatter plot look first — Anscombe's quartet is real.

## Charts

Match form to comparison:

| Question | Chart |
|---|---|
| Trend over time | line |
| Compare categories | horizontal bar, sorted |
| Distribution shape | histogram / box / ECDF |
| Relationship of two vars | scatter (+ trend line only if justified) |
| Part-of-whole (≤5 parts) | stacked bar (avoid pies beyond 3 slices) |

Rules: label axes with units, start bar charts at zero, don't dual-axis two unrelated scales, annotate the takeaway directly on the chart. One message per chart.

## Reporting Findings

Lead with the answer to the stated question, then evidence, then caveats. Every claim carries its number, denominator, and date range. Distinguish "the data shows X" from "X is plausible but this dataset can't confirm it". If the data can't answer the question, say so — that is a finding.

## Related Skills

- `xlsx`: when the deliverable is a spreadsheet file with formulas/formatting.
- `web-artifacts-builder` / Visualizer tooling: interactive dashboards.
- `llm-eval-design`: analyzing eval results is a special case — see that skill for eval-specific pitfalls.
