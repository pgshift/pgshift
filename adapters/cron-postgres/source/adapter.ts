import type { CronAdapter, CronJobInfo, CronJobOptions } from '@pgshift/core'
import type { PgPool } from './pool'
import {
  ensurePgCron,
  listJobs,
  scheduleQueueJob,
  unscheduleJob,
} from './schema.js'

function queueTable(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return `_pgshift_queue_${safe}`
}

export function createPostgresCronAdapter(
  pool: PgPool,
  defaultQueue: string,
): CronAdapter {
  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // setup
    // Ensures pg_cron extension is installed. Call once on startup.
    // -------------------------------------------------------------------------
    async setup(): Promise<void> {
      await ensurePgCron(pool)
    },

    // -------------------------------------------------------------------------
    // schedule
    // Creates or replaces a cron job that pushes a payload into a queue.
    // -------------------------------------------------------------------------
    async schedule(
      jobName: string,
      cronExpr: string,
      options: CronJobOptions,
    ): Promise<void> {
      const queue = options.queue ?? defaultQueue
      const table = queueTable(queue)
      const prefixedName = `pgshift:${jobName}`

      await scheduleQueueJob(
        pool,
        prefixedName,
        cronExpr,
        table,
        options.payload ?? {},
      )
    },

    // -------------------------------------------------------------------------
    // unschedule
    // Removes a cron job by name.
    // -------------------------------------------------------------------------
    async unschedule(jobName: string): Promise<void> {
      await unscheduleJob(pool, `pgshift:${jobName}`)
    },

    // -------------------------------------------------------------------------
    // list
    // Returns all PgShift-managed cron jobs.
    // -------------------------------------------------------------------------
    async list(): Promise<CronJobInfo[]> {
      return listJobs(pool)
    },

    // -------------------------------------------------------------------------
    // teardown
    // -------------------------------------------------------------------------
    async teardown(): Promise<void> {
      await pool.end()
    },
  }
}
