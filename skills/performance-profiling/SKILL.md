---
name: performance-profiling
description: "Use when something is slow or resource-hungry: profiling CPU/memory/IO, benchmarking before and after changes, finding hot paths, latency analysis, and deciding what to optimize. Trigger on 'why is this slow', 'optimize', 'memory leak', 'high CPU', or perf regression reports. Route correctness bugs to systematic-debugging and query-level tuning to database-and-migrations."
---

# Performance Profiling

Making slow things fast, with evidence. Correctness debugging asks "why is this wrong"; this skill asks "where does the time/memory actually go" — and refuses to optimize before answering that.

## The Iron Law

**Measure → hypothesize → change one thing → measure again.** Optimizing from intuition fails because intuition about hot paths is reliably wrong; the bottleneck is almost never where the code looks ugly.

Corollaries:
- Establish a **baseline number** before touching anything, with a written reproduction (input size, environment, command). No baseline, no claim of improvement.
- Define **"fast enough" up front** (target p95, throughput, memory ceiling). Optimization without a stop condition consumes weeks.
- After each change, keep it only if the measurement moved. Revert neutral changes — they're complexity without benefit.

## Step 1: Characterize the Bottleneck Class

Before profiling, classify with coarse tools (a few minutes):

| Symptom | Likely class | First look |
|---|---|---|
| CPU pegged, scales with input | CPU-bound | CPU profiler |
| CPU idle but slow | IO/wait-bound | trace syscalls, network, DB logs |
| Slow only at scale / over time | algorithmic or leak | complexity check, memory profiler |
| Slow only under concurrency | contention | lock/async profiler, connection pools |
| p95 fine, p99 terrible | tail: GC, retries, cold caches | latency histogram, GC logs |

Wall-clock vs CPU-time divergence is the single most diagnostic ratio: high wall, low CPU means you're waiting on something, and no amount of code tuning helps.

## Step 2: Profile

- **Python**: `py-spy top`/`record` (sampling, prod-safe), `cProfile` + snakeviz for call graphs, `memray`/`tracemalloc` for memory, `line_profiler` for a confirmed-hot function.
- **JS/Node**: `node --cpu-prof` / Chrome DevTools flamegraphs; `--heap-prof` and heap snapshots (three-snapshot diff technique) for leaks.
- **Native/anything on Linux**: `perf record -g` + flamegraph; `strace -c` / `iostat` / `vmstat` for the wait-bound classes.
- **Databases**: slow-query log + `EXPLAIN ANALYZE` (see `database-and-migrations`). Most "app is slow" tickets end here or in N+1 patterns.

Reading a flamegraph: width = time share. Ignore anything under ~5%; find the widest frame you own and ask "why is this called so often" before "how do I make it faster" — call-count reduction beats micro-optimization.

## Step 3: Fix in Order of Leverage

1. **Don't do the work**: cache it, precompute it, skip it when the result is unused, dedupe repeated calls.
2. **Do less work**: better algorithm/data structure (the O(n²) hiding in a nested lookup → dict/set), batch N calls into one (N+1 queries, chatty APIs), stream instead of materializing.
3. **Do the work elsewhere/later**: async/background jobs, move the loop to the database or to vectorized (numpy/pandas) operations.
4. **Do the work in parallel**: only after 1–3; parallelizing waste multiplies waste. Mind the GIL for Python CPU-bound work (processes, not threads).
5. **Micro-optimize**: last, only on profiler-confirmed hot lines.

## Memory

- Leaks: capture heap at t0/t1/t2 under steady load; real leaks grow monotonically across all three. Usual suspects: unbounded caches/maps, listeners never removed, closures capturing large scopes, global registries.
- High-but-stable usage isn't a leak; it's a footprint problem — fix with streaming, generators, chunked processing, and smaller in-memory representations.

## Benchmarking Honestly

- Warm up (JIT, caches) before timing; report distribution (median + p95), never a single run.
- Same machine, same load, interleaved A/B runs; a benchmark that can't be re-run by someone else is an anecdote.
- Beware dead-code elimination in microbenchmarks — consume the result.
- For services, load-test at realistic concurrency; single-request latency hides contention.

## Reporting

State: baseline, change, new measurement, conditions, and what was *not* affected ("p50 unchanged, p99 down 60%"). Perf claims follow `verification-before-completion`: numbers from runs you performed, not projections.

## Related Skills

- `systematic-debugging`: when the slow behavior is actually incorrect behavior.
- `database-and-migrations`: query plans, indexing, N+1.
- `context-optimization`: the LLM-context analogue — token budgets instead of CPU budgets.
