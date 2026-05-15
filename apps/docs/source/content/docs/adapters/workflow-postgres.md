---
title: workflow-postgres
description: PostgreSQL workflow adapter for PgShift.
---

The default workflow adapter. Implements DAG-based workflow orchestration with parallel step execution, exponential backoff retries, and saga-pattern compensation via PostgreSQL.

This adapter is bundled with `@pgshift/workflow`. You do not need to install it separately.

## How it works

**Schema** — three tables persist all workflow state:

```sql
-- Workflow definitions — steps config and DAG edges
CREATE TABLE _pgshift_workflow_definitions (
  name        TEXT PRIMARY KEY,
  steps       JSONB NOT NULL,
  dag         JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- One row per workflow execution
CREATE TABLE _pgshift_workflow_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  input       JSONB NOT NULL DEFAULT '{}',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
)

-- One row per step per run — the unit of work
CREATE TABLE _pgshift_workflow_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL,
  workflow     TEXT NOT NULL,
  step         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_retries  INTEGER NOT NULL DEFAULT 3,
  output       JSONB,
  error        TEXT,
  locked_at    TIMESTAMPTZ,
  locked_by    TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
```

**Worker loop** — polls every 200ms for active runs, identifies ready steps via DAG resolution, and dispatches them via `FOR UPDATE SKIP LOCKED`:

```sql
SELECT id, attempts FROM _pgshift_workflow_steps
WHERE run_id = $1 AND step = $2 AND status = 'pending'
FOR UPDATE SKIP LOCKED
LIMIT 1
```

**DAG resolution** — on each tick, the executor loads step statuses and applies topological sort to find which steps have all dependencies completed and are ready to run.

**Compensation** — when a step exhausts retries, the run enters `compensating` status. Compensation handlers run in reverse topological order for all completed steps that have a `compensate` handler defined.

**Reaper** — a background job reclaims steps locked by crashed workers. Steps locked for more than 30 seconds are reset to `pending`.

## Requirements

- PostgreSQL 12 or later
- No extensions required

## Step status lifecycle

```
pending → running → completed
                 ↘ failed (exhausted retries) → triggers compensation
```

During compensation:

```
completed → compensating → compensated
```

## Run status lifecycle

```
running → completed
        → failed
        → compensating → compensated
```

## Limitations

- DAG dependencies are equality only — no conditional branching based on step output
- Parallel steps share the same worker process; very CPU-intensive handlers may benefit from concurrency configuration
- Not suited for workflows requiring human approval gates between steps — use `@pgshift/state` consensus for that

## Internal tables

| Table | Purpose |
|---|---|
| `_pgshift_workflow_definitions` | Workflow step config and DAG, updated on every `define()` call |
| `_pgshift_workflow_runs` | One row per execution, tracks overall status and input |
| `_pgshift_workflow_steps` | One row per step per run, claimed via SKIP LOCKED by workers |
