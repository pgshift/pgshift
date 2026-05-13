---
title: queue-postgres
description: PostgreSQL queue adapter for PgShift.
---

The default queue adapter. Implements at-least-once job processing using PostgreSQL's `SKIP LOCKED`.

This adapter is bundled with `@pgshift/queue`. You do not need to install it separately.

## How it works

Each queue is a dedicated Postgres table with the following schema:

```sql
CREATE TABLE _pgshift_queue_emails (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payload     JSONB       NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  priority    INTEGER     NOT NULL DEFAULT 0,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  max_retries INTEGER     NOT NULL DEFAULT 3,
  run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at   TIMESTAMPTZ,
  locked_by   TEXT,
  failed_at   TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Workers claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED`, which guarantees that two workers never process the same job simultaneously.

## Delivery guarantee

At-least-once delivery. A job may be processed more than once if a worker crashes before marking the job as done. Make your handlers idempotent.

## Reaper

A background reaper periodically reclaims jobs that have been locked for longer than the visibility timeout (default 30 seconds). This handles worker crashes and network failures.

## Requirements

- PostgreSQL 12 or later

## Internal tables

| Table | Purpose |
|---|---|
| `_pgshift_queue_{name}` | Job table for a given queue |
