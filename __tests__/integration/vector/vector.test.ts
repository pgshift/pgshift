import { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '../../../packages/vector/source/index'
import { createPool, createSchema, dropSchema, schemaUrl } from '../setup/db'

// Mock embedding — deterministic fake vectors for testing without an AI provider
function mockEmbed(text: string, dimensions = 3): number[] {
  const seed = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return Array.from({ length: dimensions }, (_, i) =>
    Number((Math.sin(seed + i) * 0.5 + 0.5).toFixed(6)),
  )
}

const DIMENSIONS = 3
const INDEX_CONFIG = { dimensions: DIMENSIONS, metric: 'cosine' as const }

const DOCUMENTS = [
  { id: '1', title: 'PostgreSQL full-text search', category: 'database' },
  { id: '2', title: 'pgvector for AI applications', category: 'ai' },
  { id: '3', title: 'Building vector search with pgvector', category: 'ai' },
  { id: '4', title: 'Node.js and TypeScript guide', category: 'backend' },
]

describe('vector integration', () => {
  let pool: Pool
  let schema: string
  let url: string

  beforeEach(async () => {
    pool = createPool()
    schema = await createSchema(pool)
    url = schemaUrl(schema)
  })

  afterEach(async () => {
    await dropSchema(pool, schema)
    await pool.end()
  })

  // -------------------------------------------------------------------------
  // index
  // -------------------------------------------------------------------------

  describe('index', () => {
    it('creates the vector table without error', async () => {
      const db = createClient({ url })

      await expect(
        db.vector('documents').index(INDEX_CONFIG),
      ).resolves.not.toThrow()

      const { rows } = await pool.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = '${schema}' AND tablename = '_pgshift_vector_documents'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('is idempotent — calling index twice does not throw', async () => {
      const db = createClient({ url })

      await db.vector('documents').index(INDEX_CONFIG)
      await expect(
        db.vector('documents').index(INDEX_CONFIG),
      ).resolves.not.toThrow()

      await db.destroy()
    })

    it('creates the HNSW index', async () => {
      const db = createClient({ url })

      await db.vector('documents').index(INDEX_CONFIG)

      const { rows } = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = '${schema}'
          AND tablename = '_pgshift_vector_documents'
          AND indexname LIKE '%hnsw%'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('stores config in _pgshift_vector_config', async () => {
      const db = createClient({ url })

      await db.vector('documents').index(INDEX_CONFIG)

      const { rows } = await pool.query(`
        SELECT dimensions, metric FROM ${schema}._pgshift_vector_config
        WHERE entity = 'documents'
      `)
      expect(rows[0]?.dimensions).toBe(DIMENSIONS)
      expect(rows[0]?.metric).toBe('cosine')

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // upsert
  // -------------------------------------------------------------------------

  describe('upsert', () => {
    it('inserts a document with embedding', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      await db.vector('documents').upsert('1', {
        embedding: mockEmbed('hello world'),
        data: { title: 'Hello World' },
      })

      const { rows } = await pool.query(
        `SELECT id FROM ${schema}._pgshift_vector_documents WHERE id = '1'`,
      )
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('updates an existing document without creating a duplicate', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      await db.vector('documents').upsert('1', {
        embedding: mockEmbed('original'),
        data: { title: 'Original' },
      })

      await db.vector('documents').upsert('1', {
        embedding: mockEmbed('updated'),
        data: { title: 'Updated' },
      })

      const { rows } = await pool.query(
        `SELECT id, data FROM ${schema}._pgshift_vector_documents WHERE id = '1'`,
      )
      expect(rows).toHaveLength(1)
      expect((rows[0] as { data: { title: string } }).data.title).toBe(
        'Updated',
      )

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // query
  // -------------------------------------------------------------------------

  describe('query', () => {
    it('returns results with id, score, and data', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      await db.vector('documents').upsert('1', {
        embedding: mockEmbed('postgres database'),
        data: { title: 'PostgreSQL guide' },
      })

      const results = await db.vector('documents').query({
        embedding: mockEmbed('postgres database'),
        topK: 1,
      })

      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('score')
      expect(results[0]).toHaveProperty('data')

      await db.destroy()
    })

    it('returns at most topK results', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      for (const doc of DOCUMENTS) {
        await db.vector('documents').upsert(doc.id, {
          embedding: mockEmbed(doc.title),
          data: doc,
        })
      }

      const results = await db.vector('documents').query({
        embedding: mockEmbed('database'),
        topK: 2,
      })

      expect(results.length).toBeLessThanOrEqual(2)

      await db.destroy()
    })

    it('filters results by minScore', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      await db.vector('documents').upsert('1', {
        embedding: mockEmbed('completely unrelated content xyz'),
        data: { title: 'Unrelated' },
      })

      const results = await db.vector('documents').query({
        embedding: mockEmbed('postgres database'),
        topK: 10,
        minScore: 0.99,
      })

      // All results must meet the minimum score threshold
      results.forEach((r) => expect(r.score).toBeGreaterThanOrEqual(0.99))

      await db.destroy()
    })

    it('returns empty array when no documents exist', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      const results = await db.vector('documents').query({
        embedding: mockEmbed('anything'),
        topK: 5,
      })

      expect(results).toEqual([])

      await db.destroy()
    })

    it('throws when entity has not been indexed', async () => {
      const db = createClient({ url })

      await expect(
        db.vector('documents').query({ embedding: mockEmbed('test'), topK: 5 }),
      ).rejects.toThrow('has not been indexed yet')

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // hybrid search
  // -------------------------------------------------------------------------

  describe('hybrid search', () => {
    it('applies equality filters alongside vector similarity', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      for (const doc of DOCUMENTS) {
        await db.vector('documents').upsert(doc.id, {
          embedding: mockEmbed(doc.title),
          data: doc,
        })
      }

      const results = await db.vector('documents').query({
        embedding: mockEmbed('vector search ai'),
        topK: 10,
        filters: { category: 'ai' },
      })

      expect(results.length).toBeGreaterThan(0)
      results.forEach((r) => {
        expect((r.data as { category: string }).category).toBe('ai')
      })

      await db.destroy()
    })

    it('returns empty array when filters match no documents', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      for (const doc of DOCUMENTS) {
        await db.vector('documents').upsert(doc.id, {
          embedding: mockEmbed(doc.title),
          data: doc,
        })
      }

      const results = await db.vector('documents').query({
        embedding: mockEmbed('anything'),
        topK: 10,
        filters: { category: 'nonexistent' },
      })

      expect(results).toEqual([])

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('removes a document from the vector index', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      await db.vector('documents').upsert('1', {
        embedding: mockEmbed('hello'),
        data: { title: 'Hello' },
      })

      await db.vector('documents').delete('1')

      const { rows } = await pool.query(
        `SELECT id FROM ${schema}._pgshift_vector_documents WHERE id = '1'`,
      )
      expect(rows).toHaveLength(0)

      await db.destroy()
    })

    it('does not throw when deleting a non-existent document', async () => {
      const db = createClient({ url })
      await db.vector('documents').index(INDEX_CONFIG)

      await expect(
        db.vector('documents').delete('non-existent'),
      ).resolves.not.toThrow()

      await db.destroy()
    })
  })
})
