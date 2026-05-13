import { describe, expect, it } from 'vitest'
import {
  buildSearchQuery,
  buildVectorExpr,
} from '../../../adapters/search-postgres/source/query-builder'
import type {
  SearchIndexConfig,
  SearchQueryOptions,
} from '../../../packages/core/source/types'

describe('buildVectorExpr', () => {
  it('builds a single weighted tsvector expression', () => {
    const config: SearchIndexConfig = {
      fields: ['name'],
      weights: { name: 'A' },
    }

    const result = buildVectorExpr({ name: 'Nike Air Max' }, config, 'english')

    expect(result).toBe(
      "setweight(to_tsvector('english', 'Nike Air Max'), 'A')",
    )
  })

  it('builds multiple weighted tsvector expressions joined with ||', () => {
    const config: SearchIndexConfig = {
      fields: ['name', 'description'],
      weights: { name: 'A', description: 'B' },
    }

    const result = buildVectorExpr(
      { name: 'Nike Air Max', description: 'Classic sneaker' },
      config,
      'english',
    )

    expect(result).toBe(
      "setweight(to_tsvector('english', 'Nike Air Max'), 'A') || setweight(to_tsvector('english', 'Classic sneaker'), 'B')",
    )
  })

  it('defaults to weight D when no weight is configured for a field', () => {
    const config: SearchIndexConfig = { fields: ['name'] }

    const result = buildVectorExpr({ name: 'test' }, config, 'english')

    expect(result).toContain("'D'")
  })

  it('escapes single quotes in field values', () => {
    const config: SearchIndexConfig = { fields: ['name'] }

    const result = buildVectorExpr({ name: "O'Brien" }, config, 'english')

    expect(result).toContain("O''Brien")
  })

  it('uses empty string when field is missing from data', () => {
    const config: SearchIndexConfig = { fields: ['name', 'description'] }

    const result = buildVectorExpr({ name: 'Nike' }, config, 'english')

    expect(result).toContain("to_tsvector('english', '')")
  })

  it('uses the provided language for to_tsvector', () => {
    const config: SearchIndexConfig = { fields: ['name'] }

    const result = buildVectorExpr({ name: 'produto' }, config, 'portuguese')

    expect(result).toContain("to_tsvector('portuguese'")
  })
})

// ---------------------------------------------------------------------------
// buildSearchQuery — standard path
// ---------------------------------------------------------------------------

describe('buildSearchQuery — standard', () => {
  const table = '_pgshift_search_products'
  const config: SearchIndexConfig = { fields: ['name'], fuzzy: false }

  it('builds a standard ts_rank query', () => {
    const { sql, values } = buildSearchQuery(
      table,
      'air max',
      'english',
      {},
      config,
    )

    expect(sql).toContain('ts_rank')
    expect(sql).toContain('plainto_tsquery')
    expect(sql).toContain(table)
    expect(values).toEqual(['english', 'air max', 20])
  })

  it('applies default limit of 20', () => {
    const { sql, values } = buildSearchQuery(
      table,
      'test',
      'english',
      {},
      config,
    )

    expect(values[2]).toBe(20)
    expect(sql).toContain('LIMIT $3')
  })

  it('respects custom limit and offset', () => {
    const options: SearchQueryOptions = { limit: 10, offset: 5 }
    const { sql, values } = buildSearchQuery(
      table,
      'test',
      'english',
      options,
      config,
    )

    expect(values[2]).toBe(10)
    expect(sql).toContain('OFFSET 5')
  })

  it('appends equality filter clauses', () => {
    const options: SearchQueryOptions = { filters: { category: 'shoes' } }
    const { sql, values } = buildSearchQuery(
      table,
      'test',
      'english',
      options,
      config,
    )

    expect(sql).toContain("data->>'category' = $4")
    expect(values).toContain('shoes')
  })

  it('appends multiple equality filter clauses', () => {
    const options: SearchQueryOptions = {
      filters: { category: 'shoes', brand: 'nike' },
    }
    const { sql, values } = buildSearchQuery(
      table,
      'test',
      'english',
      options,
      config,
    )

    expect(sql).toContain("data->>'category' = $4")
    expect(sql).toContain("data->>'brand' = $5")
    expect(values).toContain('shoes')
    expect(values).toContain('nike')
  })

  it('orders results by rank descending', () => {
    const { sql } = buildSearchQuery(table, 'test', 'english', {}, config)

    expect(sql).toContain('ORDER BY rank DESC')
  })
})

// ---------------------------------------------------------------------------
// buildSearchQuery — fuzzy path
// ---------------------------------------------------------------------------

describe('buildSearchQuery — fuzzy', () => {
  const table = '_pgshift_search_products'
  const config: SearchIndexConfig = { fields: ['name'], fuzzy: true }

  it('builds a fuzzy query with word_similarity', () => {
    const { sql } = buildSearchQuery(
      table,
      'maxx',
      'english',
      { fuzzy: true },
      config,
    )

    expect(sql).toContain('word_similarity')
    expect(sql).toContain('unnest(string_to_array')
    expect(sql).toContain('bool_or')
  })

  it('uses word_similarity threshold of 0.5', () => {
    const { sql } = buildSearchQuery(
      table,
      'maxx',
      'english',
      { fuzzy: true },
      config,
    )

    expect(sql).toContain('> 0.5')
  })

  it('combines ts_rank and word_similarity in rank calculation', () => {
    const { sql } = buildSearchQuery(
      table,
      'maxx',
      'english',
      { fuzzy: true },
      config,
    )

    expect(sql).toContain('ts_rank')
    expect(sql).toContain('MAX(word_similarity')
  })

  it('falls back to standard query when fuzzy is false at query level', () => {
    const { sql } = buildSearchQuery(
      table,
      'test',
      'english',
      { fuzzy: false },
      config,
    )

    expect(sql).not.toContain('word_similarity')
  })

  it('uses index config fuzzy setting when not specified in query options', () => {
    const { sql } = buildSearchQuery(table, 'test', 'english', {}, config)

    expect(sql).toContain('word_similarity')
  })

  it('applies filters in fuzzy path', () => {
    const options: SearchQueryOptions = {
      fuzzy: true,
      filters: { category: 'shoes' },
    }
    const { sql, values } = buildSearchQuery(
      table,
      'maxx',
      'english',
      options,
      config,
    )

    expect(sql).toContain("data->>'category' = $4")
    expect(values).toContain('shoes')
  })
})
