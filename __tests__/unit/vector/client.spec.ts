import { describe, expect, it, vi } from 'vitest'
import { PgShiftClient } from '../../../packages/core/source/client'
import type {
  VectorAdapter,
  VectorResult,
} from '../../../packages/core/source/types'

function mockVectorAdapter(
  overrides: Partial<VectorAdapter> = {},
): VectorAdapter {
  return {
    name: 'mock-vector',
    index: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeClient(adapter?: VectorAdapter) {
  return new PgShiftClient({
    config: { url: 'postgres://localhost/test' },
    adapters: adapter ? { vector: () => adapter } : {},
  })
}

describe('VectorHandle', () => {
  it('throws when no vector adapter is configured', () => {
    const client = makeClient()
    expect(() => client.vector('documents')).toThrow('[PgShift]')
  })

  it('returns a vector handle when adapter is configured', () => {
    const client = makeClient(mockVectorAdapter())
    expect(client.vector('documents')).toBeDefined()
  })

  it('returns the same handle instance for the same entity', () => {
    const client = makeClient(mockVectorAdapter())
    expect(client.vector('documents')).toBe(client.vector('documents'))
  })

  it('returns different handles for different entities', () => {
    const client = makeClient(mockVectorAdapter())
    expect(client.vector('documents')).not.toBe(client.vector('images'))
  })

  it('initializes the adapter only once across multiple entity handles', () => {
    const factory = vi.fn(() => mockVectorAdapter())
    const client = new PgShiftClient({
      config: { url: 'postgres://localhost/test' },
      adapters: { vector: factory },
    })

    client.vector('documents')
    client.vector('images')
    client.vector('videos')

    expect(factory).toHaveBeenCalledOnce()
  })

  it('delegates index to the adapter', async () => {
    const adapter = mockVectorAdapter()
    const client = makeClient(adapter)
    const config = { dimensions: 1536, metric: 'cosine' as const }

    await client.vector('documents').index(config)

    expect(adapter.index).toHaveBeenCalledWith('documents', config)
  })

  it('delegates upsert to the adapter', async () => {
    const adapter = mockVectorAdapter()
    const client = makeClient(adapter)
    const data = { embedding: [0.1, 0.2, 0.3], data: { title: 'Hello' } }

    await client.vector('documents').upsert('1', data)

    expect(adapter.upsert).toHaveBeenCalledWith('documents', '1', data)
  })

  it('delegates query to the adapter and returns results', async () => {
    const results: VectorResult[] = [
      { id: '1', score: 0.95, data: { title: 'Hello' } },
    ]
    const adapter = mockVectorAdapter({
      query: vi.fn().mockResolvedValue(results),
    })
    const client = makeClient(adapter)
    const options = { embedding: [0.1, 0.2, 0.3], topK: 5 }

    const output = await client.vector('documents').query(options)

    expect(adapter.query).toHaveBeenCalledWith('documents', options)
    expect(output).toEqual(results)
  })

  it('delegates delete to the adapter', async () => {
    const adapter = mockVectorAdapter()
    const client = makeClient(adapter)

    await client.vector('documents').delete('1')

    expect(adapter.delete).toHaveBeenCalledWith('documents', '1')
  })

  it('calls teardown on destroy', async () => {
    const adapter = mockVectorAdapter()
    const client = makeClient(adapter)

    client.vector('documents') // trigger lazy init
    await client.destroy()

    expect(adapter.teardown).toHaveBeenCalledOnce()
  })
})
