import { createPostgresSearchAdapter } from '@pgshift/adapter-search-postgres'
import type { MigrationHint, PgShiftConfig } from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export interface CreateSearchClientOptions {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with search capabilities backed by PostgreSQL.
 *
 * @example
 * ```ts
 * import { createClient } from '@pgshift/search'
 *
 * const db = createClient({ url: process.env.DATABASE_URL })
 *
 * await db.search('products').index({ fields: ['name', 'description'], fuzzy: true })
 * await db.search('products').upsert('1', { name: 'Nike Air Max 90' })
 * const results = await db.search('products').query('air max', { fuzzy: true })
 * ```
 */
export function createClient(
  options: CreateSearchClientOptions,
): PgShiftClient {
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
      search: () => createPostgresSearchAdapter(config),
    },
  })
}

export type {
  SearchIndexConfig,
  SearchQueryOptions,
  SearchResult,
} from '@pgshift/core'
