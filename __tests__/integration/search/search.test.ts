import { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '../../../packages/search/source/index'
import { createPool, createSchema, dropSchema, schemaUrl } from '../setup/db'

const INDEX_CONFIG = {
  fields: ['name', 'description', 'category'],
  weights: {
    name: 'A' as const,
    description: 'B' as const,
    category: 'C' as const,
  },
  fuzzy: true,
}

const PRODUCTS = [
  {
    id: '1',
    name: 'Nike Air Max 90',
    description: 'Classic sneaker with visible Air unit.',
    category: 'shoes',
  },
  {
    id: '2',
    name: 'Adidas Ultraboost',
    description: 'High performance running shoe.',
    category: 'shoes',
  },
  {
    id: '3',
    name: 'Nike Air Force 1',
    description: 'Iconic low-top sneaker.',
    category: 'shoes',
  },
  {
    id: '4',
    name: 'MacBook Pro',
    description: 'Apple laptop with M3 chip.',
    category: 'electronics',
  },
  {
    id: '5',
    name: 'Sony WH-1000XM5',
    description: 'Noise cancelling wireless headphones.',
    category: 'electronics',
  },
]

describe('search integration', () => {
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
    it('creates the shadow table and indexes without error', async () => {
      const db = createClient({ url })

      await expect(
        db.search('products').index(INDEX_CONFIG),
      ).resolves.not.toThrow()

      const { rows } = await pool.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = '${schema}' AND tablename = '_pgshift_search_products'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('is idempotent — calling index twice does not throw', async () => {
      const db = createClient({ url })

      await db.search('products').index(INDEX_CONFIG)
      await expect(
        db.search('products').index(INDEX_CONFIG),
      ).resolves.not.toThrow()

      await db.destroy()
    })

    it('creates pg_trgm extension when fuzzy is enabled', async () => {
      const db = createClient({ url })

      await db.search('products').index({ ...INDEX_CONFIG, fuzzy: true })

      const { rows } = await pool.query(`
        SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('stores index config in _pgshift_search_config', async () => {
      const db = createClient({ url })

      await db.search('products').index(INDEX_CONFIG)

      const { rows } = await pool.query(`
        SELECT * FROM ${schema}._pgshift_search_config WHERE entity = 'products'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // upsert
  // -------------------------------------------------------------------------

  describe('upsert', () => {
    it('inserts a document into the shadow table', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)

      await db.search('products').upsert('1', PRODUCTS[0]!)

      const { rows } = await pool.query(
        `SELECT id FROM ${schema}._pgshift_search_products WHERE id = '1'`,
      )
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('updates an existing document without creating a duplicate', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)

      await db.search('products').upsert('1', {
        name: 'Nike Air Max 90',
        description: 'Original',
        category: 'shoes',
      })
      await db.search('products').upsert('1', {
        name: 'Nike Air Max 90',
        description: 'Updated',
        category: 'shoes',
      })

      const { rows } = await pool.query(
        `SELECT id, data FROM ${schema}._pgshift_search_products WHERE id = '1'`,
      )
      expect(rows).toHaveLength(1)
      expect(
        (rows[0] as { data: { description: string } }).data.description,
      ).toBe('Updated')

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // query
  // -------------------------------------------------------------------------

  describe('query', () => {
    it('returns matching documents ranked by relevance', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      for (const product of PRODUCTS)
        await db.search('products').upsert(product.id, product)

      const results = await db.search('products').query('air max')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.id).toBe('1')

      await db.destroy()
    })

    it('returns results with id, rank, and data fields', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      await db.search('products').upsert('1', PRODUCTS[0]!)

      const results = await db.search('products').query('nike')

      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('rank')
      expect(results[0]).toHaveProperty('data')

      await db.destroy()
    })

    it('returns empty array when no documents match', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      await db.search('products').upsert('1', PRODUCTS[0]!)

      const results = await db.search('products').query('zxqwerty')

      expect(results).toEqual([])

      await db.destroy()
    })

    it('applies equality filters', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      for (const product of PRODUCTS)
        await db.search('products').upsert(product.id, product)

      const results = await db.search('products').query('sneaker', {
        filters: { category: 'shoes' },
      })

      expect(
        results.every(
          (r) => (r.data as { category: string }).category === 'shoes',
        ),
      ).toBe(true)

      await db.destroy()
    })

    it('respects limit option', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      for (const product of PRODUCTS)
        await db.search('products').upsert(product.id, product)

      const results = await db.search('products').query('nike', { limit: 1 })

      expect(results).toHaveLength(1)

      await db.destroy()
    })

    it('matches with fuzzy query — typo tolerance', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      await db.search('products').upsert('1', PRODUCTS[0]!)

      const results = await db.search('products').query('maxx', { fuzzy: true })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.id).toBe('1')

      await db.destroy()
    })

    it('matches multi-word fuzzy query', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      await db.search('products').upsert('1', PRODUCTS[0]!)

      const results = await db
        .search('products')
        .query('maxx shoes 90', { fuzzy: true })

      expect(results.length).toBeGreaterThan(0)

      await db.destroy()
    })

    it('throws when entity has not been indexed', async () => {
      const db = createClient({ url })

      await expect(db.search('products').query('nike')).rejects.toThrow(
        'has not been indexed yet',
      )

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('removes a document from the search index', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)
      await db.search('products').upsert('1', PRODUCTS[0]!)

      await db.search('products').delete('1')

      const results = await db.search('products').query('nike air max')
      expect(results.find((r) => r.id === '1')).toBeUndefined()

      await db.destroy()
    })

    it('does not throw when deleting a non-existent document', async () => {
      const db = createClient({ url })
      await db.search('products').index(INDEX_CONFIG)

      await expect(
        db.search('products').delete('non-existent'),
      ).resolves.not.toThrow()

      await db.destroy()
    })
  })
})
