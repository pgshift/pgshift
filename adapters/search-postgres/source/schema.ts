import type { SearchIndexConfig } from '@pgshift/core'
import type { PgPool } from './pool'

/**
 * Converts an entity name into a safe Postgres identifier.
 * e.g. "blog posts" → "_pgshift_search_blog_posts"
 */
export function shadowTable(entity: string): string {
  const safe = entity.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return `_pgshift_search_${safe}`
}

/**
 * Creates (or updates) the shadow table, indexes, and config entry
 * for a given entity. Fully idempotent.
 */
export async function ensureSchema(
  pool: PgPool,
  entity: string,
  config: SearchIndexConfig,
): Promise<void> {
  const table = shadowTable(entity)
  const language = config.language ?? 'english'

  if (config.fuzzy) {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id          TEXT        NOT NULL PRIMARY KEY,
      search_vec  TSVECTOR,
      raw_text    TEXT        NOT NULL DEFAULT '',
      data        JSONB       NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_vec_idx
      ON ${table} USING GIN (search_vec)
  `)

  if (config.fuzzy) {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS ${table}_trgm_idx
        ON ${table} USING GIN (raw_text gin_trgm_ops)
    `)
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_search_config (
      entity     TEXT        PRIMARY KEY,
      config     JSONB       NOT NULL,
      language   TEXT        NOT NULL DEFAULT 'english',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(
    `INSERT INTO _pgshift_search_config (entity, config, language)
     VALUES ($1, $2, $3)
     ON CONFLICT (entity) DO UPDATE
       SET config   = EXCLUDED.config,
           language = EXCLUDED.language`,
    [entity, JSON.stringify(config), language],
  )
}

/**
 * Fetches the stored index config for an entity.
 * Throws a descriptive error if the entity has not been indexed yet.
 */
export async function getEntityConfig(
  pool: PgPool,
  entity: string,
): Promise<{ config: SearchIndexConfig; language: string }> {
  const rows = await pool.query<{
    config: SearchIndexConfig
    language: string
  }>('SELECT config, language FROM _pgshift_search_config WHERE entity = $1', [
    entity,
  ])

  const cfg = rows[0]
  if (!cfg) {
    throw new Error(
      `[PgShift] Entity "${entity}" has not been indexed yet. ` +
        `Call db.search("${entity}").index({ fields: [...] }) first.`,
    )
  }

  return cfg
}
