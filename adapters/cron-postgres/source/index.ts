import type { CronAdapter, PgShiftConfig } from '@pgshift/core'
import { createPostgresCronAdapter as adapterCreatePostgresCronAdapter } from './adapter'
import { PgPool } from './pool'

export { schedule } from './schedule'

/**
 * Internal factory used by @pgshift/cron.
 * Not intended to be imported directly by application code.
 */
export function createPostgresCronAdapter(
  config: PgShiftConfig,
  defaultQueue: string,
): CronAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresCronAdapter(pool, defaultQueue)
}
