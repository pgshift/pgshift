import type { QueueJob } from '@pgshift/core'
import type { PoolClient } from 'pg'
import type { PgPool } from './pool'
import { queueTable } from './schema'

const DEFAULT_POLL_INTERVAL = 1000 // ms between polls when queue is empty
const DEFAULT_TIMEOUT = 30_000 // ms before a locked job is considered stale
const WORKER_ID = `worker_${process.pid}_${Date.now()}`

export interface WorkerOptions {
  pollInterval?: number
  timeout?: number
  concurrency?: number
}

/**
 * Starts a polling worker for a given queue.
 * Returns a stop function that gracefully shuts down the worker.
 *
 * At-least-once delivery:
 * - Jobs are locked via FOR UPDATE SKIP LOCKED
 * - On success: status → done
 * - On failure: attempts++, if attempts < max_retries → status back to pending
 *               else → status → failed (dead letter)
 * - Stale jobs (locked_at expired) are requeued by the reaper
 */
export function startWorker<T = unknown>(
  pool: PgPool,
  queue: string,
  handler: (job: QueueJob<T>) => Promise<void>,
  options: WorkerOptions = {},
): () => Promise<void> {
  const table = queueTable(queue)
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL
  const timeout = options.timeout ?? DEFAULT_TIMEOUT

  let running = true
  let activeJobs = 0
  const concurrency = options.concurrency ?? 1

  const loop = async (): Promise<void> => {
    while (running) {
      if (activeJobs >= concurrency) {
        await sleep(50)
        continue
      }

      // Reap stale jobs first
      await reapStaleJobs(pool, table, timeout)

      const job = await claimJob<T>(pool, table, queue)

      if (!job) {
        await sleep(pollInterval)
        continue
      }

      activeJobs++

      processJob(pool, table, job, handler).finally(() => {
        activeJobs--
      })
    }

    // Wait for in-flight jobs to complete
    while (activeJobs > 0) {
      await sleep(100)
    }
  }

  loop()

  return async () => {
    running = false
    while (activeJobs > 0) {
      await sleep(100)
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function claimJob<T>(
  pool: PgPool,
  table: string,
  queue: string,
): Promise<QueueJob<T> | null> {
  const rows = await pool.transaction(async (client: PoolClient) => {
    const result = await client.query<{
      id: string
      payload: T
      status: string
      priority: number
      attempts: number
      max_retries: number
      run_at: Date
      created_at: Date
    }>(`
      SELECT id, payload, status, priority, attempts, max_retries, run_at, created_at
      FROM ${table}
      WHERE status = 'pending' AND run_at <= NOW()
      ORDER BY priority DESC, run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `)

    if (result.rows.length === 0) return []

    const job = result.rows[0]!

    await client.query(
      `UPDATE ${table}
       SET status = 'processing', locked_at = NOW(), locked_by = $1, attempts = attempts + 1
       WHERE id = $2`,
      [WORKER_ID, job.id],
    )

    return result.rows
  })

  if (rows.length === 0) return null

  const row = rows[0]!
  return {
    id: row.id,
    name: queue,
    payload: row.payload,
    status: 'processing',
    priority: row.priority,
    attempts: row.attempts + 1,
    maxRetries: row.max_retries,
    runAt: row.run_at,
    createdAt: row.created_at,
  }
}

async function processJob<T>(
  pool: PgPool,
  table: string,
  job: QueueJob<T>,
  handler: (job: QueueJob<T>) => Promise<void>,
): Promise<void> {
  try {
    await handler(job)

    await pool.query(
      `UPDATE ${table} SET status = 'done', locked_at = NULL, locked_by = NULL WHERE id = $1`,
      [job.id],
    )
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)

    if (job.attempts >= job.maxRetries) {
      // Move to dead letter
      await pool.query(
        `UPDATE ${table}
         SET status = 'failed', failed_at = NOW(), error = $1, locked_at = NULL, locked_by = NULL
         WHERE id = $2`,
        [error, job.id],
      )
    } else {
      // Exponential backoff before retry
      const backoffMs = Math.min(1000 * 2 ** job.attempts, 30_000)

      await pool.query(
        `UPDATE ${table}
         SET status = 'pending',
             run_at = NOW() + ($1 || ' milliseconds')::INTERVAL,
             locked_at = NULL,
             locked_by = NULL,
             error = $2
         WHERE id = $3`,
        [backoffMs, error, job.id],
      )
    }
  }
}

async function reapStaleJobs(
  pool: PgPool,
  table: string,
  timeoutMs: number,
): Promise<void> {
  await pool.query(
    `UPDATE ${table}
     SET status = 'pending', locked_at = NULL, locked_by = NULL
     WHERE status = 'processing'
       AND locked_at < NOW() - ($1 || ' milliseconds')::INTERVAL`,
    [timeoutMs],
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
