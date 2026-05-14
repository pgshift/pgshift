import type { PgShiftConfig, StateAdapter } from '@pgshift/core'
import { createPostgresStateAdapter as adapterCreatePostgresStateAdapter } from './adapter'
import { PgPool } from './pool'

export { normalizers } from './normalizer'

/**
 * Internal factory used by @pgshift/state.
 * Not intended to be imported directly by application code.
 */
export function createPostgresStateAdapter(
  config: PgShiftConfig,
): StateAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresStateAdapter(pool)
}
