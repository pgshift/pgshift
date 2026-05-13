import type { PgShiftConfig, SearchAdapter } from '@pgshift/core'
import { createPostgresSearchAdapter as adapterCreatePostgresSearchAdapter } from './adapter'
import { PgPool } from './pool'

/**
 * Internal factory used by @pgshift/search.
 * Not intended to be imported directly by application code.
 */
export function createPostgresSearchAdapter(
  config: PgShiftConfig,
): SearchAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresSearchAdapter(pool)
}
