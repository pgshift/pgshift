import type { PgShiftConfig, VectorAdapter } from '@pgshift/core'
import { createPostgresVectorAdapter as adapterCreatePostgresVectorAdapter } from './adapter'
import { PgPool } from './pool'

/**
 * Internal factory used by @pgshift/vector.
 * Not intended to be imported directly by application code.
 */
export function createPostgresVectorAdapter(
  config: PgShiftConfig,
): VectorAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresVectorAdapter(pool)
}
