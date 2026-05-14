---
title: vector-postgres
description: PostgreSQL vector adapter for PgShift.
---

The default vector adapter. Implements semantic search and hybrid search via `pgvector` and HNSW indexes.

This adapter is bundled with `@pgshift/vector`. You do not need to install it separately.

## How it works

When you call `index()`, the adapter creates a vector table and an HNSW index:

```sql
CREATE TABLE _pgshift_vector_documents (
  id         TEXT     PRIMARY KEY,
  embedding  vector(1536) NOT NULL,
  data       JSONB    NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

CREATE INDEX _pgshift_vector_documents_hnsw_idx
  ON _pgshift_vector_documents
  USING hnsw (embedding vector_cosine_ops)
```

Queries use the pgvector distance operators (`<=>`, `<->`, `<#>`) with an `ORDER BY` clause. Hybrid search applies equality filters as SQL `WHERE` conditions against the JSONB `data` column, combined with the vector search in a single query.

## Requirements

- PostgreSQL 12 or later
- `pgvector` extension — must be installed on the Postgres server

## Distance operators

| Metric | Operator | Description |
|---|---|---|
| `cosine` | `<=>` | Cosine distance. Best for text embeddings. |
| `euclidean` | `<->` | L2 distance. Best for geometric or image embeddings. |
| `dotproduct` | `<#>` | Negative inner product. Best for recommendation models. |

## Index type

PgShift uses HNSW (Hierarchical Navigable Small World) indexes exclusively. HNSW provides:

- Fast approximate nearest neighbor search at query time
- No training phase required (unlike IVFFlat)
- Consistent performance as the dataset grows
- Higher memory usage than IVFFlat — the tradeoff is worth it for most use cases

## Limitations

- Hybrid search filters are equality only — no range queries or `IN` clauses
- HNSW indexes consume more memory than IVFFlat
- Not suited for billion-scale vector datasets

When average query latency consistently exceeds the expected threshold for the index size, PgShift will suggest migrating to a dedicated vector database adapter.

## Internal tables

| Table | Purpose |
|---|---|
| `_pgshift_vector_{entity}` | Vector table storing embedding, JSONB metadata, and creation timestamp |
| `_pgshift_vector_config` | Stores dimensions and metric per entity |
