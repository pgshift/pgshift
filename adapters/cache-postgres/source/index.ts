import type { CacheAdapter, PgShiftConfig } from '@pgshift/core'
import { createPostgresCacheAdapter as adapterCreatePostgresCacheAdapter } from './adapter'
import { PgPool } from './pool'

/**
 * Internal factory used by @pgshift/cache.
 * Not intended to be imported directly by application code.
 */
export function createPostgresCacheAdapter(
  config: PgShiftConfig,
): CacheAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresCacheAdapter(pool)
}
