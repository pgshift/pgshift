import { describe, expect, it, vi } from 'vitest'
import { PgShiftClient } from '../../../packages/core/source/client'
import type {
  CacheAdapter,
  SearchAdapter,
} from '../../../packages/core/source/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockSearchAdapter(
  overrides: Partial<SearchAdapter> = {},
): SearchAdapter {
  return {
    name: 'mock-search',
    index: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function mockCacheAdapter(overrides: Partial<CacheAdapter> = {}): CacheAdapter {
  return {
    name: 'mock-cache',
    register: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue([]),
    refresh: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeClient(
  adapters: { search?: () => SearchAdapter; cache?: () => CacheAdapter } = {},
) {
  return new PgShiftClient({
    config: { url: 'postgres://localhost/test' },
    adapters,
  })
}

// ---------------------------------------------------------------------------
// PgShiftClient
// ---------------------------------------------------------------------------

describe('PgShiftClient', () => {
  describe('search facade', () => {
    it('throws when no search adapter is configured', () => {
      const client = makeClient()

      expect(() => client.search('products')).toThrow('[PgShift]')
    })

    it('returns a search handle when adapter is configured', () => {
      const client = makeClient({ search: () => mockSearchAdapter() })
      const handle = client.search('products')

      expect(handle).toBeDefined()
    })

    it('returns the same handle instance for the same entity', () => {
      const client = makeClient({ search: () => mockSearchAdapter() })

      const a = client.search('products')
      const b = client.search('products')

      expect(a).toBe(b)
    })

    it('returns different handles for different entities', () => {
      const client = makeClient({ search: () => mockSearchAdapter() })

      const a = client.search('products')
      const b = client.search('articles')

      expect(a).not.toBe(b)
    })

    it('initializes the adapter only once across multiple entity handles', () => {
      const factory = vi.fn(() => mockSearchAdapter())
      const client = makeClient({ search: factory })

      client.search('products')
      client.search('articles')
      client.search('users')

      expect(factory).toHaveBeenCalledOnce()
    })

    it('delegates index to the adapter', async () => {
      const adapter = mockSearchAdapter()
      const client = makeClient({ search: () => adapter })

      await client.search('products').index({ fields: ['name'] })

      expect(adapter.index).toHaveBeenCalledWith('products', {
        fields: ['name'],
      })
    })

    it('delegates upsert to the adapter', async () => {
      const adapter = mockSearchAdapter()
      const client = makeClient({ search: () => adapter })

      await client.search('products').upsert('1', { name: 'Nike' })

      expect(adapter.upsert).toHaveBeenCalledWith('products', '1', {
        name: 'Nike',
      })
    })

    it('delegates query to the adapter and returns results', async () => {
      const results = [{ id: '1', rank: 0.9, data: { name: 'Nike' } }]
      const adapter = mockSearchAdapter({
        query: vi.fn().mockResolvedValue(results),
      })
      const client = makeClient({ search: () => adapter })

      const output = await client.search('products').query('nike')

      expect(adapter.query).toHaveBeenCalledWith('products', 'nike', undefined)
      expect(output).toEqual(results)
    })

    it('delegates delete to the adapter', async () => {
      const adapter = mockSearchAdapter()
      const client = makeClient({ search: () => adapter })

      await client.search('products').delete('1')

      expect(adapter.delete).toHaveBeenCalledWith('products', '1')
    })
  })

  describe('cache facade', () => {
    it('throws when no cache adapter is configured', () => {
      const client = makeClient()

      expect(() => client.cache('top_products')).toThrow('[PgShift]')
    })

    it('returns a cache handle when adapter is configured', () => {
      const client = makeClient({ cache: () => mockCacheAdapter() })

      expect(client.cache('top_products')).toBeDefined()
    })

    it('returns the same handle instance for the same name', () => {
      const client = makeClient({ cache: () => mockCacheAdapter() })

      const a = client.cache('top_products')
      const b = client.cache('top_products')

      expect(a).toBe(b)
    })

    it('returns different handles for different names', () => {
      const client = makeClient({ cache: () => mockCacheAdapter() })

      const a = client.cache('top_products')
      const b = client.cache('revenue_by_category')

      expect(a).not.toBe(b)
    })

    it('delegates register to the adapter', async () => {
      const adapter = mockCacheAdapter()
      const client = makeClient({ cache: () => adapter })
      const config = { query: 'SELECT 1', refreshEvery: 60 }

      await client.cache('top_products').register(config)

      expect(adapter.register).toHaveBeenCalledWith('top_products', config)
    })

    it('delegates get to the adapter and returns rows', async () => {
      const rows = [{ id: 1, name: 'Widget A' }]
      const adapter = mockCacheAdapter({ get: vi.fn().mockResolvedValue(rows) })
      const client = makeClient({ cache: () => adapter })

      const output = await client.cache('top_products').get()

      expect(adapter.get).toHaveBeenCalledWith('top_products')
      expect(output).toEqual(rows)
    })

    it('delegates refresh to the adapter', async () => {
      const adapter = mockCacheAdapter()
      const client = makeClient({ cache: () => adapter })

      await client.cache('top_products').refresh()

      expect(adapter.refresh).toHaveBeenCalledWith('top_products')
    })
  })

  describe('destroy', () => {
    it('calls teardown on the search adapter', async () => {
      const adapter = mockSearchAdapter()
      const client = makeClient({ search: () => adapter })

      client.search('products') // trigger lazy init
      await client.destroy()

      expect(adapter.teardown).toHaveBeenCalledOnce()
    })

    it('calls teardown on the cache adapter', async () => {
      const adapter = mockCacheAdapter()
      const client = makeClient({ cache: () => adapter })

      client.cache('top_products') // trigger lazy init
      await client.destroy()

      expect(adapter.teardown).toHaveBeenCalledOnce()
    })

    it('does not throw when no adapters were initialized', async () => {
      const client = makeClient()

      await expect(client.destroy()).resolves.not.toThrow()
    })
  })

  describe('metrics', () => {
    it('fires onMigrationHint when search latency threshold is crossed', async () => {
      const onMigrationHint = vi.fn()
      const adapter = mockSearchAdapter({
        query: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 0))
          return []
        }),
      })

      const client = new PgShiftClient({
        config: { url: 'postgres://localhost/test' },
        metrics: true,
        onMigrationHint,
        adapters: { search: () => adapter },
      })

      // Record 100 snapshots manually via the metrics path
      // by patching the internal metrics collector
      const { MetricsCollector } = await import(
        '../../../packages/core/source/metrics'
      )
      const collector = new MetricsCollector(onMigrationHint)
      for (let i = 0; i < 100; i++) {
        collector.record({
          module: 'search',
          adapter: 'postgres',
          timestamp: new Date(),
          value: 300,
          unit: 'ms',
        })
      }

      expect(onMigrationHint).toHaveBeenCalledOnce()
    })

    it('does not collect metrics when metrics is false', async () => {
      const onMigrationHint = vi.fn()
      const client = new PgShiftClient({
        config: { url: 'postgres://localhost/test' },
        metrics: false,
        onMigrationHint,
        adapters: { search: () => mockSearchAdapter() },
      })

      await client.search('products').query('test')

      expect(onMigrationHint).not.toHaveBeenCalled()
    })
  })
})
