---
title: cache-postgres
description: PostgreSQL cache adapter for PgShift.
---

The default cache adapter. Implements query result caching via PostgreSQL materialized views.

This adapter is bundled with `@pgshift/cache`. You do not need to install it separately.

## How it works

`register()` creates a materialized view in your database. The view stores the pre-computed result of your query on disk.

`get()` reads directly from the view with no recalculation. If the view is stale based on `refreshEvery`, a background refresh is triggered using `REFRESH MATERIALIZED VIEW CONCURRENTLY`, which does not block reads.

## The `_pgshift_id` convention

`REFRESH CONCURRENTLY` requires a unique index on the view. PgShift looks for a column aliased as `_pgshift_id` to create this index automatically.

```sql
SELECT
  p.id AS _pgshift_id,   -- required for non-blocking refresh
  p.name,
  SUM(o.amount) AS total
FROM products p
LEFT JOIN orders o ON o.product_id = p.id
GROUP BY p.id, p.name
```

Without `_pgshift_id`, refresh falls back to a blocking mode that locks the view during updates.

## Requirements

- PostgreSQL 12 or later

## Limitations

- Not suited for caching arbitrary objects by key. Use Redis for that use case.
- No per-entry TTL.
- Refresh granularity is per-view, not per-row.

When average read latency exceeds 50ms over 100 reads, PgShift will suggest migrating to a Redis adapter.

## Internal tables

| Table | Purpose |
|---|---|
| `_pgshift_cache_{name}` | Materialized view storing pre-computed query results |
| `_pgshift_cache_config` | Stores view configuration and refresh metadata |
