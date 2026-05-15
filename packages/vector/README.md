# @pgshift/vector

> Semantic search and hybrid search for PostgreSQL.
> No Pinecone required.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/vector)](https://www.npmjs.com/package/@pgshift/vector)
[![license](https://img.shields.io/npm/l/@pgshift/vector)](https://github.com/pgshift/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/vector)](https://www.npmjs.com/package/@pgshift/vector)

</div>

---

## Why?

Most teams add AI-powered search and immediately reach for Pinecone or Weaviate. That means a new managed service, new API keys, a sync pipeline between your database and the vector store, and cross-service joins every time you want to combine vector similarity with relational filters.

PostgreSQL with `pgvector` solves this natively. Semantic search, hybrid search, and relational filters all run in a single query against the same database you already use. No sync pipeline. No cross-service joins.

---

## Install

```bash
npm install @pgshift/vector
```

Requires the `pgvector` extension on your PostgreSQL server. Available on Supabase, Neon, Amazon RDS, and Tembo. For local development, use the provided Docker setup.

---

## Quick start

```ts
import { createClient } from '@pgshift/vector'

const db = createClient({
  url: process.env.DATABASE_URL,
})

await db.vector('documents').index({
  dimensions: 1536,
  metric: 'cosine',
})

await db.vector('documents').upsert('1', {
  embedding: await embed('Getting started with PgShift'),
  data: { title: 'Getting started', userId: '123', category: 'docs' },
})

const results = await db.vector('documents').query({
  embedding: await embed('how to install pgshift'),
  topK: 5,
  filters: { userId: '123' },
  minScore: 0.7,
})
// [{ id: '1', score: 0.94, data: { title: 'Getting started', ... } }]

await db.destroy()
```

---

## Features

- Semantic nearest neighbor search via `pgvector` and HNSW indexes
- Hybrid search — vector similarity and relational filters in a single query
- Three distance metrics: cosine, euclidean, dot product
- Model-agnostic — pass any float array as the embedding
- Zero external infrastructure
- Migration hints when query latency consistently exceeds thresholds
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application
     |
@pgshift/vector
     |
PostgreSQL
 |-- vector table (_pgshift_vector_{entity})
 |-- HNSW index (approximate nearest neighbor)
 |-- JSONB (metadata + filters)
 |-- config table (_pgshift_vector_config)
```

---

## Hybrid search

The key advantage over Pinecone and Weaviate: vector similarity and relational filters in one query, with no cross-service join.

```ts
// Without hybrid search — two round trips, manual intersection in memory
const vectors = await pinecone.query({ vector: embedding, topK: 100 })
const filtered = vectors.filter(v => v.metadata.userId === '123').slice(0, 10)

// With PgShift — one query, no manual intersection
const results = await db.vector('documents').query({
  embedding,
  topK: 10,
  filters: { userId: '123' },
})
```

---

## Distance metrics

| Metric | Operator | Best for |
|---|---|---|
| `cosine` | `<=>` | Text embeddings, semantic similarity |
| `euclidean` | `<->` | Geometric distance, image embeddings |
| `dotproduct` | `<#>` | Recommendation models |

For text embeddings, `cosine` is almost always the right choice.

---

## Embedding models

PgShift is model-agnostic. Pass any float array as the embedding. Match `dimensions` exactly to your model.

```ts
// OpenAI text-embedding-ada-002 — dimensions: 1536
const { data } = await openai.embeddings.create({
  model: 'text-embedding-ada-002',
  input: text,
})
const embedding = data[0].embedding
```

---

## Migration hints

PgShift tracks average query latency. When it consistently exceeds 100ms over 100 queries, it emits a migration hint.

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
  max: 10,
  ssl: { rejectUnauthorized: false },
  onMigrationHint(hint) { ... },
})
```

---

### `db.vector(entity).index(config)`

Creates the vector table and HNSW index. Idempotent, safe to call on every startup.

```ts
await db.vector('documents').index({
  dimensions: 1536,
  metric: 'cosine',
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `dimensions` | `number` | required | Must match your embedding model exactly |
| `metric` | `string` | `'cosine'` | `cosine`, `euclidean`, or `dotproduct` |

---

### `db.vector(entity).upsert(id, data)`

Inserts or updates a vector and its metadata. If a document with the same `id` already exists, it is replaced.

```ts
await db.vector('documents').upsert('doc-1', {
  embedding: [0.1, 0.2, ...],
  data: { title: 'Getting started', userId: '123' },
})
```

---

### `db.vector(entity).query(options)`

Searches the index and returns the nearest neighbors ranked by similarity score.

```ts
const results = await db.vector('documents').query({
  embedding: queryEmbedding,
  topK: 10,
  minScore: 0.7,
  filters: { userId: '123' },
})
```

Returns `VectorResult<T>[]`:

```ts
interface VectorResult<T> {
  id: string
  score: number  // 0 to 1, higher is more similar
  data: T
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `embedding` | `number[]` | required | The query vector |
| `topK` | `number` | `10` | Maximum number of results |
| `minScore` | `number` | none | Minimum similarity score (0 to 1) |
| `filters` | `object` | none | Equality filters for hybrid search |

---

### `db.vector(entity).delete(id)`

Removes a document from the vector index.

```ts
await db.vector('documents').delete('doc-1')
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

## When NOT to use PostgreSQL vector search

Migrate to Pinecone or Weaviate when you need:

- Billion-scale vector datasets
- Sub-10ms query latency at very high query volumes
- Multi-region vector replication
- Advanced filtering beyond equality checks

PgShift tells you when that time comes.
