import type {
  VectorAdapter,
  VectorIndexConfig,
  VectorQueryOptions,
  VectorResult,
  VectorUpsertData,
} from '@pgshift/core'
import type { PgPool } from './pool'
import {
  distanceOperator,
  distanceToScore,
  ensureSchema,
  getEntityConfig,
  vectorTable,
} from './schema'

export function createPostgresVectorAdapter(pool: PgPool): VectorAdapter {
  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // index
    // Creates the vector table and HNSW index for an entity.
    // Idempotent — safe to call on every startup.
    // -------------------------------------------------------------------------
    async index(entity: string, config: VectorIndexConfig): Promise<void> {
      await ensureSchema(pool, entity, config)
    },

    // -------------------------------------------------------------------------
    // upsert
    // Inserts or updates a vector and its metadata.
    // -------------------------------------------------------------------------
    async upsert(
      entity: string,
      id: string,
      data: VectorUpsertData,
    ): Promise<void> {
      const table = vectorTable(entity)
      const embeddingStr = `[${data.embedding.join(',')}]`

      await pool.query(
        `INSERT INTO ${table} (id, embedding, data)
         VALUES ($1, $2::vector, $3::jsonb)
         ON CONFLICT (id) DO UPDATE
           SET embedding = EXCLUDED.embedding,
               data      = EXCLUDED.data`,
        [id, embeddingStr, JSON.stringify(data.data ?? {})],
      )
    },

    // -------------------------------------------------------------------------
    // query
    // Nearest neighbor search with optional hybrid filters.
    //
    // Hybrid search: filters apply as SQL WHERE clauses against the JSONB data
    // column, combined with the vector similarity search in a single query.
    // This is the key advantage over Pinecone — no cross-service joins.
    // -------------------------------------------------------------------------
    async query<T = Record<string, unknown>>(
      entity: string,
      options: VectorQueryOptions,
    ): Promise<VectorResult<T>[]> {
      const table = vectorTable(entity)
      const { dimensions: _, metric } = await getEntityConfig(pool, entity)

      const topK = options.topK ?? 10
      const embeddingStr = `[${options.embedding.join(',')}]`
      const op = distanceOperator(metric)

      // Build equality filter clauses from options.filters
      const filters = options.filters ? Object.entries(options.filters) : []
      const filterClauses = filters
        .map(([key], i) => `AND data->>'${key}' = $${i + 3}`)
        .join('\n        ')
      const filterValues = filters.map(([, v]) => String(v))

      const rows = await pool.query<{ id: string; distance: number; data: T }>(
        `SELECT
           id,
           embedding ${op} $1::vector AS distance,
           data
         FROM ${table}
         WHERE true
         ${filterClauses}
         ORDER BY embedding ${op} $1::vector
         LIMIT $2`,
        [embeddingStr, topK, ...filterValues],
      )

      return rows
        .map((r) => ({
          id: r.id,
          score: distanceToScore(Number(r.distance), metric),
          data: r.data,
        }))
        .filter(
          (r) => options.minScore === undefined || r.score >= options.minScore,
        )
    },

    // -------------------------------------------------------------------------
    // delete
    // Removes a vector by ID.
    // -------------------------------------------------------------------------
    async delete(entity: string, id: string): Promise<void> {
      const table = vectorTable(entity)
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id])
    },

    // -------------------------------------------------------------------------
    // teardown
    // -------------------------------------------------------------------------
    async teardown(): Promise<void> {
      await pool.end()
    },
  }
}
