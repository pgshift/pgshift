import { createPostgresCronAdapter } from '@pgshift/adapter-cron-postgres'
import { schedule } from './schedule.js'
import type {
  CronJobInfo,
  CronJobOptions,
  MigrationHint,
  PgShiftConfig,
} from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export type { CronJobInfo, CronJobOptions } from '@pgshift/core'

export { schedule }

export interface CreateCronClientOptions {
  url: string
  /** Default queue to push jobs into. Required. */
  queue: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with cron capabilities backed by pg_cron.
 *
 * Requires the pg_cron extension installed in your PostgreSQL instance.
 * Jobs are pushed into a @pgshift/queue table when they fire.
 *
 * @example
 * ```ts
 * import { createClient, schedule } from '@pgshift/cron'
 *
 * const db = createClient({
 *   url: process.env.DATABASE_URL,
 *   queue: 'emails',
 * })
 *
 * await db.cron.setup()
 *
 * await db.cron('weekly-digest').schedule(schedule.weekly({ day: 'monday', hour: 8 }), {
 *   payload: { type: 'weekly-digest' },
 * })
 *
 * await db.cron('cleanup').schedule(schedule.daily({ hour: 0 }), {
 *   queue: 'maintenance',
 *   payload: { type: 'cleanup-expired-sessions' },
 * })
 *
 * const jobs = await db.cron.list()
 * ```
 */
export function createClient(
  options: CreateCronClientOptions,
): PgShiftClient & {
  cron: CronApi
} {
  const config: PgShiftConfig = {
    url: options.url,
    max: options.max,
    ssl: options.ssl,
  }

  const adapter = createPostgresCronAdapter(config, options.queue)

  const client = new PgShiftClient({
    config,
    metrics: options.metrics,
    onMigrationHint: options.onMigrationHint,
    adapters: {},
  }) as PgShiftClient & { cron: CronApi }

  client.cron = buildCronApi(adapter)

  return client
}

// ---------------------------------------------------------------------------
// CronApi — callable function with namespace methods
// ---------------------------------------------------------------------------

type CronAdapter = ReturnType<typeof createPostgresCronAdapter>

export type CronApi = {
  (name: string): CronHandle
  setup(): Promise<void>
  list(): Promise<CronJobInfo[]>
}

function buildCronApi(adapter: CronAdapter): CronApi {
  return Object.assign(
    (name: string): CronHandle => new CronHandle(name, adapter),
    {
      setup: async (): Promise<void> => {
        await adapter.setup()
      },
      list: async (): Promise<CronJobInfo[]> => {
        return await adapter.list()
      },
    },
  )
}

class CronHandle {
  constructor(
    private readonly name: string,
    private readonly adapter: CronAdapter,
  ) {}

  async schedule(cronExpr: string, options: CronJobOptions): Promise<void> {
    return this.adapter.schedule(this.name, cronExpr, options)
  }

  async unschedule(): Promise<void> {
    return this.adapter.unschedule(this.name)
  }
}
