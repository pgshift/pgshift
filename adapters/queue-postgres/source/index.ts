import type { PgShiftConfig, QueueAdapter } from '@pgshift/core'
import { createPostgresQueueAdapter as adapterCreatePostgresQueueAdapter } from './adapter'
import { PgPool } from './pool'

/**
 * Internal factory used by @pgshift/queue.
 * Not intended to be imported directly by application code.
 */
export function createPostgresQueueAdapter(
  config: PgShiftConfig,
): QueueAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresQueueAdapter(pool)
}
