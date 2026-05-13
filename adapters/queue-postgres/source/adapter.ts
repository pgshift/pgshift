import type {
  QueueAdapter,
  QueueJob,
  QueueJobOptions,
  QueueStats,
} from '@pgshift/core'
import type { PgPool } from './pool'
import { ensureQueue, queueTable } from './schema'
import { startWorker } from './worker'

export function createPostgresQueueAdapter(pool: PgPool): QueueAdapter {
  const stoppers = new Map<string, () => Promise<void>>()

  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // ensureQueue
    // Creates the queue table if it does not exist. Idempotent.
    // -------------------------------------------------------------------------
    async ensureQueue(queue: string): Promise<void> {
      await ensureQueue(pool, queue)
    },

    // -------------------------------------------------------------------------
    // push
    // Inserts a job into the queue. Returns the job ID.
    // -------------------------------------------------------------------------
    async push<T = unknown>(
      queue: string,
      payload: T,
      options: QueueJobOptions = {},
    ): Promise<string> {
      const table = queueTable(queue)
      const delayMs = options.delay ?? 0
      const priority = options.priority ?? 0
      const maxRetries = options.retries ?? 3

      const rows = await pool.query<{ id: string }>(
        `INSERT INTO ${table} (payload, priority, max_retries, run_at)
         VALUES ($1::jsonb, $2, $3, NOW() + ($4 || ' milliseconds')::INTERVAL)
         RETURNING id`,
        [JSON.stringify(payload), priority, maxRetries, delayMs],
      )

      return rows[0]!.id
    },

    // -------------------------------------------------------------------------
    // process
    // Starts a polling worker for the queue.
    // The worker runs until teardown() is called.
    // -------------------------------------------------------------------------
    async process<T = unknown>(
      queue: string,
      handler: (job: QueueJob<T>) => Promise<void>,
    ): Promise<void> {
      await ensureQueue(pool, queue)

      const stop = startWorker<T>(pool, queue, handler)
      stoppers.set(queue, stop)
    },

    // -------------------------------------------------------------------------
    // cancel
    // Cancels a pending job. Has no effect if the job is already processing.
    // -------------------------------------------------------------------------
    async cancel(queue: string, jobId: string): Promise<void> {
      const table = queueTable(queue)
      await pool.query(
        `DELETE FROM ${table} WHERE id = $1 AND status = 'pending'`,
        [jobId],
      )
    },

    // -------------------------------------------------------------------------
    // stats
    // Returns counts per status for a given queue.
    // -------------------------------------------------------------------------
    async stats(queue: string): Promise<QueueStats> {
      const table = queueTable(queue)

      const rows = await pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM ${table} GROUP BY status`,
      )

      const counts: Record<string, number> = {}
      for (const row of rows) {
        counts[row.status] = Number(row.count)
      }

      return {
        pending: counts['pending'] ?? 0,
        processing: counts['processing'] ?? 0,
        done: counts['done'] ?? 0,
        failed: counts['failed'] ?? 0,
      }
    },

    // -------------------------------------------------------------------------
    // teardown
    // Stops all workers and drains the pool.
    // -------------------------------------------------------------------------
    async teardown(): Promise<void> {
      await Promise.all([...stoppers.values()].map((stop) => stop()))
      stoppers.clear()
      await pool.end()
    },
  }
}
