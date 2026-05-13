import { createPostgresQueueAdapter } from '@pgshift/adapter-queue-postgres'
import type { MigrationHint, PgShiftConfig } from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export interface CreateQueueClientOptions {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with queue capabilities backed by PostgreSQL.
 *
 * Uses SKIP LOCKED for efficient job polling.
 * Guarantees at-least-once delivery with automatic retries and dead letter queue.
 *
 * @example
 * ```ts
 * import { createClient } from '@pgshift/queue'
 *
 * const db = createClient({ url: process.env.DATABASE_URL })
 *
 * // Setup the queue table
 * await db.queue('emails').setup()
 *
 * // Push a job
 * await db.queue('emails').push({ to: 'user@example.com', subject: 'Welcome' })
 *
 * // Process jobs
 * await db.queue('emails').process(async (job) => {
 *   await sendEmail(job.payload)
 * })
 *
 * // Graceful shutdown
 * process.on('SIGTERM', () => db.destroy())
 * ```
 */
export function createClient(options: CreateQueueClientOptions): PgShiftClient {
  const config: PgShiftConfig = {
    url: options.url,
    max: options.max,
    ssl: options.ssl,
  }

  return new PgShiftClient({
    config,
    metrics: options.metrics,
    onMigrationHint: options.onMigrationHint,
    adapters: {
      queue: () => createPostgresQueueAdapter(config),
    },
  })
}

export type { QueueJob, QueueJobOptions, QueueStats } from '@pgshift/core'
