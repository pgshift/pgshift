import type { VectorIndexConfig, VectorMetric } from '@pgshift/core'
import type { PgPool } from './pool'

/**
 * Converts an entity name into a safe Postgres identifier.
 * e.g. "blog posts" → "_pgshift_vector_blog_posts"
 */
export function vectorTable(entity: string): string {
  const safe = entity.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return `_pgshift_vector_${safe}`
}

/**
 * Returns the Postgres operator for a given distance metric.
 *
 * cosine      → <=>  (cosine distance)
 * euclidean   → <->  (L2 distance)
 * dotproduct  → <#>  (negative inner product)
 */
export function distanceOperator(metric: VectorMetric): string {
  switch (metric) {
    case 'cosine':
      return '<=>'
    case 'euclidean':
      return '<->'
    case 'dotproduct':
      return '<#>'
  }
}

/**
 * Converts a distance to a similarity score in the range 0 to 1.
 *
 * cosine: score = 1 - distance (distance is already 0-2, normalized to 0-1)
 * euclidean: score = 1 / (1 + distance)
 * dotproduct: pgvector returns negative inner product, so score = 1 + distance
 */
export function distanceToScore(
  distance: number,
  metric: VectorMetric,
): number {
  switch (metric) {
    case 'cosine':
      return 1 - distance
    case 'euclidean':
      return 1 / (1 + distance)
    case 'dotproduct':
      return 1 + distance
  }
}

/**
 * Creates the vector table, HNSW index, and config entry for a given entity.
 * Idempotent — safe to call on every startup.
 */
export async function ensureSchema(
  pool: PgPool,
  entity: string,
  config: VectorIndexConfig,
): Promise<void> {
  const table = vectorTable(entity)
  const metric = config.metric ?? 'cosine'

  await pool.query('CREATE EXTENSION IF NOT EXISTS vector')

  // Vector table: id, embedding, metadata as JSONB
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id         TEXT     NOT NULL PRIMARY KEY,
      embedding  vector(${config.dimensions}) NOT NULL,
      data       JSONB    NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // HNSW index for fast approximate nearest neighbor search
  const hnswOp =
    metric === 'cosine'
      ? 'vector_cosine_ops'
      : metric === 'euclidean'
        ? 'vector_l2_ops'
        : 'vector_ip_ops'

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_hnsw_idx
      ON ${table} USING hnsw (embedding ${hnswOp})
  `)

  // Config table — stores dimensions and metric so query can use correct operator
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_vector_config (
      entity     TEXT    PRIMARY KEY,
      dimensions INTEGER NOT NULL,
      metric     TEXT    NOT NULL DEFAULT 'cosine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(
    `INSERT INTO _pgshift_vector_config (entity, dimensions, metric)
     VALUES ($1, $2, $3)
     ON CONFLICT (entity) DO UPDATE
       SET dimensions = EXCLUDED.dimensions,
           metric     = EXCLUDED.metric`,
    [entity, config.dimensions, metric],
  )
}

/**
 * Fetches the stored config for an entity.
 * Throws if the entity has not been indexed yet.
 */
export async function getEntityConfig(
  pool: PgPool,
  entity: string,
): Promise<{ dimensions: number; metric: VectorMetric }> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_vector_config (
      entity     TEXT    PRIMARY KEY,
      dimensions INTEGER NOT NULL,
      metric     TEXT    NOT NULL DEFAULT 'cosine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const rows = await pool.query<{ dimensions: number; metric: VectorMetric }>(
    'SELECT dimensions, metric FROM _pgshift_vector_config WHERE entity = $1',
    [entity],
  )

  const cfg = rows[0]
  if (!cfg) {
    throw new Error(
      `[PgShift] Vector entity "${entity}" has not been indexed yet. ` +
        `Call db.vector("${entity}").index({ dimensions: N }) first.`,
    )
  }

  return cfg
}
