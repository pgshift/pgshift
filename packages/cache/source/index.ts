import { createPostgresCacheAdapter } from '@pgshift/adapter-cache-postgres'
import type { MigrationHint, PgShiftConfig } from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export interface CreateCacheClientOptions {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with cache capabilities backed by PostgreSQL materialized views.
 *
 * @example
 * ```ts
 * import { createClient } from '@pgshift/cache'
 *
 * const db = createClient({ url: process.env.DATABASE_URL })
 *
 * await db.cache('top_products').register({
 *   query: `SELECT id AS _pgshift_id, name FROM products LIMIT 10`,
 *   refreshEvery: 60,
 * })
 *
 * const rows = await db.cache('top_products').get()
 * ```
 */
export function createClient(options: CreateCacheClientOptions): PgShiftClient {
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
      cache: () => createPostgresCacheAdapter(config),
    },
  })
}

export type { CacheViewConfig } from '@pgshift/core'
