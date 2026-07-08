---
name: database-and-migrations
description: "Use for database work: schema design, writing and reviewing migrations, zero-downtime schema changes, indexing and query optimization, and choosing between SQL patterns. Trigger on 'add a column/table', 'migration', 'slow query', 'index', or data-model design. Route system-level datastore selection to engineering:system-design and deploy sequencing to engineering:deploy-checklist."
---

# Database & Migrations

Schema design, safe schema evolution, and query performance. The organizing principle: **the database outlives the code** — schema decisions are the most expensive ones to reverse, and migrations are the riskiest deploys.

## Schema Design

- Model the entities and their true cardinalities first; the tables follow. Every many-to-many gets a junction table with its own identity if the relationship carries attributes.
- Default to third normal form; denormalize only with a measured read-path reason, and document the invariant the duplicate must maintain.
- Every table: a stable primary key (avoid natural keys that can change), `created_at`/`updated_at`, and explicit `NOT NULL` wherever the domain demands it — nullable-by-default is how "impossible" states arrive.
- Prefer database-enforced constraints (FKs, uniques, checks) over application-only enforcement; app code has bugs and second writers.
- Enums vs lookup tables: lookup tables when values change without deploys or carry attributes; DB enums only for truly fixed sets.
- Soft deletes (`deleted_at`) only when un-delete or audit is a real requirement — they poison every query with a filter and every unique index with a partial condition. Decide deliberately.

## Migration Safety

**The cardinal rule: code and schema deploy at different moments, so both orders must work.** Every migration must be compatible with the code version running before *and* after it.

**Expand–migrate–contract** for any breaking change:
1. **Expand**: add the new column/table (nullable or defaulted), deploy code that writes both old and new.
2. **Migrate**: backfill in batches; verify counts match.
3. **Contract**: deploy code that reads only the new shape; later, drop the old column in its own migration.

**Operations that lock or scan the whole table** (know your engine's specifics):
- Adding a NOT NULL column with volatile default, adding an index without `CONCURRENTLY` (Postgres), changing a column type — all can lock a hot table for minutes. Use concurrent index builds, add-nullable-then-backfill-then-set-not-null, and `NOT VALID` constraints validated separately.
- Backfills run in batches (1–10k rows) with sleeps, keyed by PK range, resumable, and never inside one giant transaction.

**Migration hygiene**
- One logical change per migration; never edit a migration that has run anywhere shared.
- Every migration states its rollback: a real `down`, or an explicit "forward-only, revert by X" note. Data-destroying migrations (drops, truncations) get a snapshot/backup step first.
- Test against a production-shaped dataset — an ALTER that's instant on 100 rows can be an outage on 100M.

## Indexing & Query Performance

- Index what you filter, join, and order by — in that composite order (equality columns first, then range, then sort). A composite index serves its prefixes; redundant single-column indexes on the same prefix are waste.
- Every index taxes writes and storage. Audit unused indexes (pg_stat_user_indexes / sys.dm_db_index_usage_stats) before adding more.
- Diagnose with `EXPLAIN ANALYZE`, not intuition. Red flags: sequential scan on a large table with a selective filter, nested loop over big row counts, sort spilling to disk, row-estimate wildly off actual (→ stale statistics).
- **N+1 queries**: the most common ORM pathology. Detect via query logs in a hot path (count queries per request); fix with eager loading / joins / batched `IN` lookups.
- Pagination: keyset (`WHERE id > last_seen ORDER BY id LIMIT n`) over `OFFSET` for deep pages.
- `SELECT *` in application code couples every query to the full schema and defeats covering indexes; select what you use.

## Transactions & Concurrency

- Keep transactions short; never hold one across a network call or user interaction.
- Know the isolation level you're actually running (usually READ COMMITTED) and what it doesn't protect against; use `SELECT ... FOR UPDATE` or optimistic version columns for read-modify-write races.
- Lock ordering: multiple-row updates in a consistent key order to avoid deadlocks; treat deadlock errors as retryable.

## Review Checklist for a Migration PR

1. Both deploy orders safe (old code + new schema, new code + old schema)?
2. Any full-table lock or scan on a large/hot table?
3. Backfill batched and resumable?
4. Rollback story stated?
5. New constraints/indexes actually match the query patterns the feature adds?
6. Destructive step separated and delayed from the expand step?

## Related Skills

- `engineering:system-design`: choosing the datastore and top-level data model.
- `engineering:deploy-checklist`: sequencing migration + code deploys with rollback triggers.
- `performance-profiling`: when slowness might not be the database at all — measure first.
