import type { PgPool } from './pool'

/**
 * Schema overview:
 *
 * _pgshift_workflow_definitions
 *   Stores the workflow definition: steps config and DAG edges.
 *
 * _pgshift_workflow_runs
 *   One row per workflow execution (run). Tracks overall status.
 *
 * _pgshift_workflow_steps
 *   One row per step per run. Tracks individual step status,
 *   attempts, output, and error. This is the unit of work
 *   picked up by workers via SKIP LOCKED.
 */

export async function ensureSchema(pool: PgPool): Promise<void> {
  // Workflow definitions — stores config and DAG
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_workflow_definitions (
      name        TEXT        PRIMARY KEY,
      steps       JSONB       NOT NULL,
      dag         JSONB       NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Workflow runs — one per execution
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_workflow_runs (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow    TEXT        NOT NULL REFERENCES _pgshift_workflow_definitions(name),
      status      TEXT        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'completed', 'failed', 'compensating', 'compensated')),
      input       JSONB       NOT NULL DEFAULT '{}',
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS _pgshift_workflow_runs_workflow_idx
      ON _pgshift_workflow_runs (workflow, status)
  `)

  // Workflow steps — one per step per run
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_workflow_steps (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id        UUID        NOT NULL REFERENCES _pgshift_workflow_runs(id),
      workflow      TEXT        NOT NULL,
      step          TEXT        NOT NULL,
      status        TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'running', 'completed', 'failed', 'compensating', 'compensated', 'skipped')),
      attempts      INTEGER     NOT NULL DEFAULT 0,
      max_retries   INTEGER     NOT NULL DEFAULT 3,
      output        JSONB,
      error         TEXT,
      locked_at     TIMESTAMPTZ,
      locked_by     TEXT,
      started_at    TIMESTAMPTZ,
      completed_at  TIMESTAMPTZ,
      UNIQUE (run_id, step)
    )
  `)

  // Index for worker polling — pending steps that are ready to run
  await pool.query(`
    CREATE INDEX IF NOT EXISTS _pgshift_workflow_steps_poll_idx
      ON _pgshift_workflow_steps (run_id, status)
      WHERE status IN ('pending', 'running')
  `)

  // Index for compensation — completed steps with compensate handler
  await pool.query(`
    CREATE INDEX IF NOT EXISTS _pgshift_workflow_steps_compensate_idx
      ON _pgshift_workflow_steps (run_id)
      WHERE status = 'completed'
  `)
}

export interface WorkflowStepRow {
  id: string
  run_id: string
  workflow: string
  step: string
  status: string
  attempts: number
  max_retries: number
  output: Record<string, unknown> | null
  error: string | null
  locked_at: Date | null
  locked_by: string | null
  started_at: Date | null
  completed_at: Date | null
}

export interface WorkflowRunRow {
  id: string
  workflow: string
  status: string
  input: Record<string, unknown>
  started_at: Date
  finished_at: Date | null
}
