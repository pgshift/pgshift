import type { CacheAdapter, CacheViewConfig } from '@pgshift/core'
import type { PgPool } from './pool'
import {
  ensureConfigTable,
  ensureView,
  getViewConfig,
  isStale,
  refreshView,
  viewName,
} from './schema'

export function createPostgresCacheAdapter(pool: PgPool): CacheAdapter {
  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // register
    // Creates (or updates) a materialized view for the given name and query.
    // Idempotent — safe to call on every startup.
    // -------------------------------------------------------------------------
    async register(name: string, config: CacheViewConfig): Promise<void> {
      await ensureConfigTable(pool)
      await ensureView(pool, name, config)
    },

    // -------------------------------------------------------------------------
    // get
    // Returns all rows from the materialized view.
    // Triggers a non-blocking background refresh if the view is stale.
    // -------------------------------------------------------------------------
    async get<T = unknown>(name: string): Promise<T[]> {
      const view = viewName(name)
      const { refreshEvery, lastRefreshed } = await getViewConfig(pool, name)

      if (isStale(lastRefreshed, refreshEvery)) {
        refreshView(pool, name).catch((err) => {
          console.warn(
            `[PgShift] Background refresh failed for "${name}":`,
            err,
          )
        })
      }

      const rows = await pool.query<Record<string, unknown>>(
        `SELECT * FROM ${view}`,
      )
      return rows as T[]
    },

    // -------------------------------------------------------------------------
    // refresh
    // Manually triggers a blocking refresh.
    // Use when you need current data before reading.
    // -------------------------------------------------------------------------
    async refresh(name: string): Promise<void> {
      await refreshView(pool, name)
    },

    // -------------------------------------------------------------------------
    // teardown
    // Drains the connection pool. Call on process exit.
    // -------------------------------------------------------------------------
    async teardown(): Promise<void> {
      await pool.end()
    },
  }
}
