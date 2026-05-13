import type { CacheViewConfig } from '@pgshift/core'
import type { PgPool } from './pool'

/**
 * Converts a view name into a safe Postgres identifier.
 * e.g. "top products" → "_pgshift_cache_top_products"
 */
export function viewName(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return `_pgshift_cache_${safe}`
}

/**
 * Creates the config table if it does not exist.
 * Idempotent — safe to call on every startup.
 */
export async function ensureConfigTable(pool: PgPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_cache_config (
      name           TEXT        PRIMARY KEY,
      query          TEXT        NOT NULL,
      refresh_every  INTEGER,
      last_refreshed TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

/**
 * Creates or recreates the materialized view for a given name.
 * If the registered query changes, the view is dropped and recreated.
 *
 * Requires the SQL query to expose a column aliased as _pgshift_id
 * for REFRESH CONCURRENTLY support. Without it, refresh falls back
 * to blocking mode.
 */
export async function ensureView(
  pool: PgPool,
  name: string,
  config: CacheViewConfig,
): Promise<void> {
  const view = viewName(name)

  const existing = await pool.query<{ query: string }>(
    'SELECT query FROM _pgshift_cache_config WHERE name = $1',
    [name],
  )

  // Drop and recreate if query changed
  if (existing[0] && existing[0].query !== config.query) {
    await pool.query(`DROP MATERIALIZED VIEW IF EXISTS ${view}`)
  }

  await pool.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${view} AS
    ${config.query}
  `)

  // Unique index required for REFRESH CONCURRENTLY.
  // The user must expose a unique column aliased as _pgshift_id in their query.
  await pool
    .query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${view}_idx ON ${view} (_pgshift_id)
  `)
    .catch(() => {
      // _pgshift_id not present — REFRESH CONCURRENTLY unavailable, falls back to blocking
    })

  await pool.query(
    `INSERT INTO _pgshift_cache_config (name, query, refresh_every, last_refreshed)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (name) DO UPDATE
       SET query         = EXCLUDED.query,
           refresh_every = EXCLUDED.refresh_every`,
    [name, config.query, config.refreshEvery ?? null],
  )
}

/**
 * Returns stored config for a registered view.
 * Throws if the view has not been registered yet.
 */
export async function getViewConfig(
  pool: PgPool,
  name: string,
): Promise<{
  query: string
  refreshEvery: number | null
  lastRefreshed: Date | null
}> {
  const rows = await pool.query<{
    query: string
    refresh_every: number | null
    last_refreshed: Date | null
  }>(
    'SELECT query, refresh_every, last_refreshed FROM _pgshift_cache_config WHERE name = $1',
    [name],
  )

  const cfg = rows[0]
  if (!cfg) {
    throw new Error(
      `[PgShift] Cache view "${name}" has not been registered. ` +
        `Call db.cache("${name}").register({ query: '...' }) first.`,
    )
  }

  return {
    query: cfg.query,
    refreshEvery: cfg.refresh_every,
    lastRefreshed: cfg.last_refreshed,
  }
}

/**
 * Returns true if the view is stale based on refreshEvery.
 */
export function isStale(
  lastRefreshed: Date | null,
  refreshEvery: number | null,
): boolean {
  if (!refreshEvery || !lastRefreshed) return true
  return (Date.now() - lastRefreshed.getTime()) / 1000 >= refreshEvery
}

/**
 * Refreshes the materialized view and updates last_refreshed.
 * Attempts CONCURRENTLY first — falls back to blocking if no unique index.
 */
export async function refreshView(pool: PgPool, name: string): Promise<void> {
  const view = viewName(name)

  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`)
  } catch {
    await pool.query(`REFRESH MATERIALIZED VIEW ${view}`)
  }

  await pool.query(
    'UPDATE _pgshift_cache_config SET last_refreshed = NOW() WHERE name = $1',
    [name],
  )
}
