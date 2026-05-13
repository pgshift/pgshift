import { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '../../../packages/cache/source/index'
import { createPool, createSchema, dropSchema, schemaUrl } from '../setup/db'

describe('cache integration', () => {
  let pool: Pool
  let schema: string
  let url: string

  beforeEach(async () => {
    pool = createPool()
    schema = await createSchema(pool)
    url = schemaUrl(schema)

    // Create application tables inside the isolated schema
    await pool.query(`
      CREATE TABLE ${schema}.products (
        id       SERIAL PRIMARY KEY,
        name     TEXT NOT NULL,
        category TEXT NOT NULL
      )
    `)

    await pool.query(`
      CREATE TABLE ${schema}.orders (
        id         SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES ${schema}.products(id),
        amount     NUMERIC NOT NULL
      )
    `)

    await pool.query(`
      INSERT INTO ${schema}.products (name, category) VALUES
        ('Widget A', 'Widgets'),
        ('Gadget X', 'Gadgets')
    `)

    await pool.query(`
      INSERT INTO ${schema}.orders (product_id, amount) VALUES
        (1, 49.99), (1, 29.99),
        (2, 99.99)
    `)
  })

  afterEach(async () => {
    await dropSchema(pool, schema)
    await pool.end()
  })

  const BASE_QUERY = `
    SELECT
      p.id          AS _pgshift_id,
      p.name,
      p.category,
      COUNT(o.id)   AS order_count,
      SUM(o.amount) AS total_revenue
    FROM products p
    LEFT JOIN orders o ON o.product_id = p.id
    GROUP BY p.id, p.name, p.category
    ORDER BY total_revenue DESC NULLS LAST
    LIMIT 10
  `

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('creates a materialized view without error', async () => {
      const db = createClient({ url })

      await expect(
        db
          .cache('top_products')
          .register({ query: BASE_QUERY, refreshEvery: 60 }),
      ).resolves.not.toThrow()

      const { rows } = await pool.query(`
        SELECT matviewname FROM pg_matviews
        WHERE schemaname = '${schema}' AND matviewname = '_pgshift_cache_top_products'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('is idempotent — calling register twice does not throw', async () => {
      const db = createClient({ url })

      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })
      await expect(
        db
          .cache('top_products')
          .register({ query: BASE_QUERY, refreshEvery: 60 }),
      ).resolves.not.toThrow()

      await db.destroy()
    })

    it('stores view config in _pgshift_cache_config', async () => {
      const db = createClient({ url })

      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      const { rows } = await pool.query(
        `SELECT * FROM ${schema}._pgshift_cache_config WHERE name = 'top_products'`,
      )
      expect(rows).toHaveLength(1)
      expect((rows[0] as { refresh_every: number }).refresh_every).toBe(60)

      await db.destroy()
    })

    it('recreates the view when the query changes', async () => {
      const db = createClient({ url })

      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      const newQuery = `SELECT p.id AS _pgshift_id, p.name FROM products p LIMIT 5`
      await expect(
        db
          .cache('top_products')
          .register({ query: newQuery, refreshEvery: 30 }),
      ).resolves.not.toThrow()

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('returns rows from the materialized view', async () => {
      const db = createClient({ url })
      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      const rows = await db.cache('top_products').get()

      expect(rows.length).toBeGreaterThan(0)

      await db.destroy()
    })

    it('returns rows with expected fields', async () => {
      const db = createClient({ url })
      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      const rows = await db
        .cache('top_products')
        .get<{ name: string; category: string }>()

      expect(rows[0]).toHaveProperty('name')
      expect(rows[0]).toHaveProperty('category')

      await db.destroy()
    })

    it('throws when view has not been registered', async () => {
      const db = createClient({ url })

      await expect(db.cache('top_products').get()).rejects.toThrow(
        'has not been registered',
      )

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // refresh
  // -------------------------------------------------------------------------

  describe('refresh', () => {
    it('refreshes the view without error', async () => {
      const db = createClient({ url })
      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      await expect(db.cache('top_products').refresh()).resolves.not.toThrow()

      await db.destroy()
    })

    it('reflects updated data after refresh', async () => {
      const db = createClient({ url })
      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      await pool.query(
        `INSERT INTO ${schema}.products (name, category) VALUES ('New Product', 'Widgets')`,
      )
      await pool.query(
        `INSERT INTO ${schema}.orders (product_id, amount) VALUES (3, 999.99)`,
      )

      const before = await db.cache('top_products').get<{ name: string }>()
      const hasNewBefore = before.some((r) => r.name === 'New Product')

      await db.cache('top_products').refresh()
      const after = await db.cache('top_products').get<{ name: string }>()
      const hasNewAfter = after.some((r) => r.name === 'New Product')

      expect(hasNewBefore).toBe(false)
      expect(hasNewAfter).toBe(true)

      await db.destroy()
    })

    it('updates last_refreshed in config after refresh', async () => {
      const db = createClient({ url })
      await db
        .cache('top_products')
        .register({ query: BASE_QUERY, refreshEvery: 60 })

      const { rows: before } = await pool.query(
        `SELECT last_refreshed FROM ${schema}._pgshift_cache_config WHERE name = 'top_products'`,
      )

      await new Promise((r) => setTimeout(r, 10))
      await db.cache('top_products').refresh()

      const { rows: after } = await pool.query(
        `SELECT last_refreshed FROM ${schema}._pgshift_cache_config WHERE name = 'top_products'`,
      )

      expect(
        new Date(after[0].last_refreshed) > new Date(before[0].last_refreshed),
      ).toBe(true)

      await db.destroy()
    })
  })
})
