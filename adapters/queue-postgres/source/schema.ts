import type { PgPool } from './pool'

/**
 * Converts a queue name into a safe Postgres identifier.
 * e.g. "send emails" → "_pgshift_queue_send_emails"
 */
export function queueTable(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return `_pgshift_queue_${safe}`
}

/**
 * Creates the queue table for a given queue name.
 * Idempotent — safe to call on every startup.
 *
 * Schema:
 *   id          — unique job identifier
 *   payload     — job data as JSONB
 *   status      — pending | processing | done | failed
 *   priority    — higher number = processed first
 *   attempts    — number of times this job has been attempted
 *   max_retries — max attempts before moving to failed
 *   run_at      — earliest time the job can be picked up
 *   locked_at   — when the job was last picked up by a worker
 *   locked_by   — worker identifier that holds the lock
 *   failed_at   — when the job permanently failed
 *   error       — last error message
 *   created_at  — insertion timestamp
 */
export async function ensureQueue(pool: PgPool, name: string): Promise<void> {
  const table = queueTable(name)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      payload     JSONB       NOT NULL,
      status      TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'done', 'failed')),
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
  `)

  // Index for efficient job polling — pending jobs ordered by priority and run_at
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_poll_idx
      ON ${table} (priority DESC, run_at ASC)
      WHERE status = 'pending'
  `)

  // Index for reaper — finds stale processing jobs
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_reaper_idx
      ON ${table} (locked_at)
      WHERE status = 'processing'
  `)
}
