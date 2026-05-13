---
title: search-postgres
description: PostgreSQL search adapter for PgShift.
---

The default search adapter. Implements full-text search via TSVector and TSQuery, with optional fuzzy matching via `pg_trgm`.

This adapter is bundled with `@pgshift/search`. You do not need to install it separately.

## How it works

When you call `index()`, the adapter creates a shadow table alongside your application data:

```sql
CREATE TABLE _pgshift_search_products (
  id         TEXT PRIMARY KEY,
  search_vec TSVECTOR,
  raw_text   TEXT,
  data       JSONB,
  updated_at TIMESTAMPTZ
)
```

Queries use `plainto_tsquery` for standard full-text search and `word_similarity` from `pg_trgm` for fuzzy matching. Filters apply as equality checks against the JSONB `data` column.

## Requirements

- PostgreSQL 12 or later
- `pg_trgm` extension, enabled automatically when `fuzzy: true`

## Limitations

- Not suited for datasets requiring geo-distributed indexing
- Fuzzy matching degrades at very high document volumes
- No support for custom analyzers or relevance tuning beyond field weights

When average query latency exceeds 200ms over 100 queries, PgShift will suggest migrating to an Elasticsearch adapter.

## Internal tables

| Table | Purpose |
|---|---|
| `_pgshift_search_{entity}` | Shadow table storing tsvector, raw text, and JSONB data |
| `_pgshift_search_config` | Stores index configuration per entity |
