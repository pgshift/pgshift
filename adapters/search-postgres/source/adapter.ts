import type {
  SearchAdapter,
  SearchIndexConfig,
  SearchQueryOptions,
  SearchResult,
} from '@pgshift/core'
import type { PgPool } from './pool'
import { buildSearchQuery, buildVectorExpr } from './query-builder'
import { ensureSchema, getEntityConfig, shadowTable } from './schema'

export function createPostgresSearchAdapter(pool: PgPool): SearchAdapter {
  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // index
    // Creates the shadow table and indexes for an entity.
    // Idempotent — safe to call on every startup.
    // -------------------------------------------------------------------------
    async index(entity: string, config: SearchIndexConfig): Promise<void> {
      await ensureSchema(pool, entity, config)
    },

    // -------------------------------------------------------------------------
    // upsert
    // Inserts or updates a document in the search index.
    // Rebuilds the tsvector from indexed fields automatically.
    // -------------------------------------------------------------------------
    async upsert(
      entity: string,
      id: string,
      data: Record<string, unknown>,
    ): Promise<void> {
      const table = shadowTable(entity)
      const { config, language } = await getEntityConfig(pool, entity)

      const rawText = config.fields.map((f) => String(data[f] ?? '')).join(' ')
      const vectorExpr = buildVectorExpr(data, config, language)

      await pool.query(
        `INSERT INTO ${table} (id, search_vec, raw_text, data, updated_at)
         VALUES ($1, ${vectorExpr}, $2, $3::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE
           SET search_vec = EXCLUDED.search_vec,
               raw_text   = EXCLUDED.raw_text,
               data       = EXCLUDED.data,
               updated_at = EXCLUDED.updated_at`,
        [id, rawText, JSON.stringify(data)],
      )
    },

    // -------------------------------------------------------------------------
    // query
    // Full-text search with optional fuzzy matching and equality filters.
    // -------------------------------------------------------------------------
    async query<T = Record<string, unknown>>(
      entity: string,
      term: string,
      options: SearchQueryOptions = {},
    ): Promise<SearchResult<T>[]> {
      const table = shadowTable(entity)
      const { config: indexConfig, language } = await getEntityConfig(
        pool,
        entity,
      )
      const lang = options.language ?? language

      const { sql, values } = buildSearchQuery(
        table,
        term,
        lang,
        options,
        indexConfig,
      )

      const rows = await pool.query<{ id: string; rank: string; data: T }>(
        sql,
        values,
      )

      return rows.map((r) => ({
        id: r.id,
        rank: Number(r.rank),
        data: r.data,
      }))
    },

    // -------------------------------------------------------------------------
    // delete
    // Removes a document from the shadow table.
    // Does NOT touch your main application table.
    // -------------------------------------------------------------------------
    async delete(entity: string, id: string): Promise<void> {
      const table = shadowTable(entity)
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id])
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
