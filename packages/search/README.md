# @pgshift/search

> Full-text search for PostgreSQL.
> No Elasticsearch cluster required.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/search)](https://www.npmjs.com/package/@pgshift/search)
[![license](https://img.shields.io/npm/l/@pgshift/search)](https://github.com/pgshift/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/search)](https://www.npmjs.com/package/@pgshift/search)

</div>

---

## Why?

Most applications do not need Elasticsearch.

PostgreSQL already provides:

- full-text search
- ranking
- stemming
- trigram similarity
- typo tolerance
- indexing
- relational filtering

`@pgshift/search` exposes those capabilities through a clean API and tells you exactly when PostgreSQL stops being the right tool.

---

## Install

```bash
npm install @pgshift/search
```

---

## Quick start

```ts
import { createClient } from '@pgshift/search'

const db = createClient({ url: process.env.DATABASE_URL })

const products = [
  {
    id: '1',
    name: 'Nike Air Max 90',
    description: 'Classic sneaker with visible Air unit.',
    category: 'shoes',
  }
]

await db.search('products').index({
  fields: ['name', 'description', 'category'],
  weights: { name: 'A', description: 'B', category: 'C' },
  fuzzy: true,
})

for (const product of products) {
  await db.search('products').upsert(product.id, product)
}

const response = await db.search('products').query('air max', { limit: 10 })
console.log(response)
// [{ id: '1', rank: 0.997, data: { name: 'Nike Air Max 90', ... } }]

await db.destroy()
```

---

## Features

- PostgreSQL-native full-text search via `tsvector` and `tsquery`
- Typo tolerance via `pg_trgm` — enabled per query with `fuzzy: true`
- Relevance ranking via `ts_rank`
- Equality filters combined with search in a single query
- Field-level weight configuration (`A`, `B`, `C`, `D`)
- Zero external infrastructure
- Migration hints when query latency consistently exceeds thresholds
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application
     |
@pgshift/search
     |
PostgreSQL
 |-- tsvector + GIN index
 |-- pg_trgm (fuzzy)
 |-- ts_rank (ranking)
 |-- JSONB (data + filters)
```

Each entity gets a shadow table (`_pgshift_search_{entity}`) that stores the tsvector, raw text, and document data as JSONB. Your application tables are not modified.

---

## Fuzzy search

Enable typo tolerance using PostgreSQL trigram similarity.

```ts
const results = await db.search('products').query('iphon proo', {
  fuzzy: true,
})
```

Fuzzy matching uses `word_similarity` from `pg_trgm`. Each word in the query is compared independently against the indexed text with a similarity threshold of 0.5.

The `pg_trgm` extension is enabled automatically when you call `index()` with `fuzzy: true`.

---

## Weighted ranking

Control ranking priority per field. Fields with weight `A` rank higher than `B`, `C`, or `D`.

```ts
await db.search('products').index({
  fields: ['name', 'description', 'category'],
  weights: {
    name: 'A',        // highest weight
    description: 'B',
    category: 'C',
  },
})
```

---

## Relational filters

Combine full-text search with equality filters in a single query. Filters apply against the JSONB data column.

```ts
const results = await db.search('products').query('running shoes', {
  filters: {
    category: 'sports',
  },
})
```

Filters are equality checks. All filter values are compared as strings against the stored JSONB.

---

## Hybrid search

Combine search with multiple relational constraints in one query.

```ts
const results = await db.search('documents').query('distributed systems', {
  filters: {
    organization_id: 'org_123',
    visibility: 'public',
  },
  limit: 20,
  offset: 0,
})
```

---

## Pagination

```ts
const results = await db.search('products').query('nike', {
  limit: 10,
  offset: 20,
})
```

---

## Migration hints

PgShift tracks average query latency. When it consistently exceeds 200ms over 100 queries, it emits a migration hint.

```ts
const db = createClient({
  url: process.env.DATABASE_URL,
  onMigrationHint(hint) {
    console.warn(hint.reason)
    console.warn(`Consider migrating to ${hint.suggestedAdapter}`)
  },
})
```

---

## API

### `createClient(options)`

```ts
const db = createClient({
  url: process.env.DATABASE_URL,
  max: 10,                          // connection pool size, default 10
  ssl: { rejectUnauthorized: false }, // optional SSL config
  onMigrationHint(hint) { ... },    // optional migration hint callback
})
```

---

### `db.search(entity).index(config)`

Creates the search index for an entity. Idempotent, safe to call on every startup.

```ts
await db.search('products').index({
  fields: ['name', 'description', 'category'],
  weights: { name: 'A', description: 'B', category: 'C' },
  fuzzy: true,
  language: 'english',
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `fields` | `string[]` | required | Fields to include in the search index |
| `weights` | `Record<string, 'A' \| 'B' \| 'C' \| 'D'>` | all `D` | Per-field ranking weight |
| `fuzzy` | `boolean` | `false` | Enable trigram fuzzy matching |
| `language` | `string` | `'english'` | Stemming language |

---

### `db.search(entity).upsert(id, data)`

Inserts or updates a document in the search index. Call this after creating or updating a record in your main table.

```ts
await db.search('products').upsert('1', {
  name: 'Nike Air Max 90',
  description: 'Classic sneaker with visible Air unit.',
  category: 'shoes',
})
```

---

### `db.search(entity).query(term, options?)`

Searches the index and returns ranked results.

```ts
const results = await db.search('products').query('air max', {
  fuzzy: true,
  filters: { category: 'shoes' },
  limit: 20,
  offset: 0,
})
```

Returns `SearchResult<T>[]`:

```ts
interface SearchResult<T> {
  id: string
  rank: number  // 0 to 1 relevance score
  data: T
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `fuzzy` | `boolean` | index default | Enable fuzzy matching for this query |
| `filters` | `Record<string, string>` | none | Equality filters |
| `limit` | `number` | `20` | Max results to return |
| `offset` | `number` | `0` | Pagination offset |
| `language` | `string` | index default | Override stemming language |

---

### `db.search(entity).delete(id)`

Removes a document from the search index.

```ts
await db.search('products').delete('1')
```

---

### `db.destroy()`

Drains the connection pool. Always call on process exit.

```ts
process.on('SIGTERM', async () => {
  await db.destroy()
  process.exit(0)
})
```

---

## When NOT to use PostgreSQL search

Migrate to Elasticsearch when you need:

- Multi-terabyte search indexes across distributed nodes
- Advanced relevance tuning with custom analyzers and tokenizers
- Extremely high write throughput with near-real-time indexing
- Cross-region search replication
- Complex aggregations over search results at scale

PgShift tells you when that time comes. Until then, one Postgres instance is enough.
