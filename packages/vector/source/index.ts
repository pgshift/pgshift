import { createPostgresVectorAdapter } from '@pgshift/adapter-vector-postgres'
import type {
  MigrationHint,
  PgShiftConfig,
  VectorAdapter,
  VectorIndexConfig,
  VectorQueryOptions,
  VectorResult,
  VectorUpsertData,
} from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export type {
  VectorIndexConfig,
  VectorQueryOptions,
  VectorResult,
  VectorUpsertData,
} from '@pgshift/core'

export interface CreateVectorClientOptions {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with vector search capabilities backed by pgvector.
 *
 * Supports nearest neighbor search, hybrid search (vector + relational filters),
 * and three distance metrics: cosine, euclidean, and dot product.
 *
 * Requires the pgvector extension. Install it on your Postgres instance:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *
 * @example
 * ```ts
 * import { createClient } from '@pgshift/vector'
 *
 * const db = createClient({ url: process.env.DATABASE_URL })
 *
 * await db.vector('documents').index({ dimensions: 1536, metric: 'cosine' })
 *
 * await db.vector('documents').upsert('1', {
 *   embedding: await embed('Getting started with PgShift'),
 *   data: { title: 'Getting started', userId: '123' },
 * })
 *
 * const results = await db.vector('documents').query({
 *   embedding: await embed('how to install pgshift'),
 *   topK: 5,
 *   filters: { userId: '123' },
 * })
 * ```
 */
export function createClient(
  options: CreateVectorClientOptions,
): PgShiftClient & {
  vector: (entity: string) => VectorHandle
} {
  const config: PgShiftConfig = {
    url: options.url,
    max: options.max,
    ssl: options.ssl,
  }

  const adapter = createPostgresVectorAdapter(config)
  const handles = new Map<string, VectorHandle>()

  const client = new PgShiftClient({
    config,
    metrics: options.metrics,
    onMigrationHint: options.onMigrationHint,
    adapters: {},
  }) as PgShiftClient & { vector: (entity: string) => VectorHandle }

  client.vector = (entity: string): VectorHandle => {
    if (!handles.has(entity)) {
      handles.set(entity, new VectorHandle(entity, adapter))
    }
    return handles.get(entity)!
  }

  // Patch destroy to also teardown the vector adapter
  const originalDestroy = client.destroy.bind(client)
  client.destroy = async () => {
    await originalDestroy()
    await adapter.teardown?.()
  }

  return client
}

// ---------------------------------------------------------------------------
// VectorHandle — fluent API per entity
// ---------------------------------------------------------------------------

class VectorHandle {
  constructor(
    private readonly entity: string,
    private readonly adapter: VectorAdapter,
  ) {}

  async index(config: VectorIndexConfig): Promise<void> {
    return this.adapter.index(this.entity, config)
  }

  async upsert(id: string, data: VectorUpsertData): Promise<void> {
    return this.adapter.upsert(this.entity, id, data)
  }

  async query<T = Record<string, unknown>>(
    options: VectorQueryOptions,
  ): Promise<VectorResult<T>[]> {
    return this.adapter.query<T>(this.entity, options)
  }

  async delete(id: string): Promise<void> {
    return this.adapter.delete(this.entity, id)
  }
}
