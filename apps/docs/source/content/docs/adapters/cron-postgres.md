---
title: cron-postgres
description: PostgreSQL cron adapter for PgShift using pg_cron.
---

The default cron adapter. Uses the `pg_cron` extension to schedule jobs and inserts payloads directly into a `@pgshift/queue` table when they fire.

This adapter is bundled with `@pgshift/cron`. You do not need to install it separately.

## How it works

When you call `db.cron(name).schedule(expr, options)`, the adapter:

1. Removes any existing `pg_cron` job with the same name.
2. Registers a new job via `cron.schedule(name, expr, sql)`.
3. The SQL inserts a row into the target `_pgshift_queue_*` table with `status = 'pending'`.

Your `@pgshift/queue` worker then picks it up as a normal job.

All PgShift-managed jobs use the `pgshift:` prefix in `pg_cron`, so they are namespaced away from any other jobs you may have.

## Schema used

The adapter writes into the existing queue table:

```sql
INSERT INTO _pgshift_queue_tasks (payload, status, run_at)
VALUES ('{"type":"cleanup"}'::jsonb, 'pending', NOW())
```

No additional tables are created by the cron adapter itself.

## Requirements

- PostgreSQL 12 or later
- `pg_cron` extension installed and enabled

## pg_cron installation

On managed providers:

- **AWS RDS / Aurora**: enable via parameter group (`shared_preload_libraries = pg_cron`) and restart the instance.
- **Supabase**: `pg_cron` is pre-installed. Call `db.cron.setup()` to activate it.
- **Self-hosted**: install the extension package (`postgresql-{version}-cron`) and add `pg_cron` to `shared_preload_libraries` in `postgresql.conf`.

## Internal tables

| Table | Purpose |
|---|---|
| `cron.job` | Native `pg_cron` job registry (read-only from PgShift) |
| `_pgshift_queue_{name}` | Queue table where job payloads are inserted |
