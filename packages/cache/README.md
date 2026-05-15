# @pgshift/cache

> Query result caching for PostgreSQL.
> No Redis required.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/cache)](https://www.npmjs.com/package/@pgshift/cache)
[![license](https://img.shields.io/npm/l/@pgshift/cache)](https://github.com/pgshift/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/cache)](https://www.npmjs.com/package/@pgshift/cache)

</div>

---

## Why?

Every application has at least one query that is too expensive to run on every request. The typical answer is Redis — a separate service to provision, monitor, and keep in sync with your database.

PostgreSQL has had a better answer for years: materialized views. Pre-compute the result of any query. Read it instantly. Refresh it without blocking reads.

`@pgshift/cache` gives you a clean API on top of that and tells you exactly when Redis is actually the right tool.

---

## Install

```bash
npm install @pgshift/cache
```

---

## Quick start

```ts
import { createClient } from '@pgshift/cache'

const db = createClient({
  url: process.env.DATABASE_URL,
})

await db.cache('top_products').register({
  query: `
    SELECT
      p.id          AS _pgshift_id,
      p.name,
      p.category,
      SUM(o.amount) AS total_revenue
    FROM products p
    LEFT JOIN orders o ON o.product_id = p.id
    GROUP BY p.id, p.name, p.category
    ORDER BY total_revenue DESC NULLS LAST
    LIMIT 100
  `,
  refreshEvery: 60,
})

const rows = await db.cache('top_products').get()

await db.destroy()
```

---

## Features

- Pre-compute expensive queries via PostgreSQL materialized views
- Instant reads with no recalculation at query time
- Non-blocking refresh via `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- Zero external infrastructure
- Migration hints when read latency consistently exceeds thresholds
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application
     |
@pgshift/cache
     |
PostgreSQL
 |-- materialized view (_pgshift_cache_{name})
 |-- config table (_pgshift_cache_config)
 |-- UNIQUE index (_pgshift_id) for concurrent refresh
```

---

## The `_pgshift_id` convention

`REFRESH CONCURRENTLY` requires a unique index on the view. Alias any unique column as `_pgshift_id` in your query and PgShift creates the index automatically, enabling non-blocking refreshes.

```ts
await db.cache('top_products').register({
  query: `
    SELECT
      p.id AS _pgshift_id,   -- required for non-blocking refresh
      p.name,
      SUM(o.amount) AS revenue
    FROM products p
    LEFT JOIN orders o ON o.product_id = p.id
    GROUP BY p.id, p.name
  `,
  refreshEvery: 60,
})
```

Without `_pgshift_id`, refresh falls back to blocking mode.

---

## Manual refresh

Trigger a refresh explicitly after bulk imports or significant data changes.

```ts
await db.cache('top_products').refresh()
```

---

## Migration hints

PgShift tracks average read latency. When it consistently exceeds 50ms over 100 reads, it emits a migration hint.

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

### `db.cache(name).register(config)`

Creates a named materialized view. Idempotent, safe to call on every startup. Recreates the view automatically if the query changes.

```ts
await db.cache('top_products').register({
  query: `SELECT p.id AS _pgshift_id, p.name FROM products p LIMIT 100`,
  refreshEvery: 60,
})
```

| Option | Type | Description |
|---|---|---|
| `query` | `string` | SQL query to materialize |
| `refreshEvery` | `number` | Refresh interval in seconds |

---

### `db.cache(name).get()`

Returns all rows from the materialized view. Reads are instant regardless of query complexity.

```ts
const rows = await db.cache('top_products').get<{
  name: string
  revenue: number
}>()
```

---

### `db.cache(name).refresh()`

Manually triggers a blocking refresh. Use when you need current data before the next scheduled refresh.

```ts
await db.cache('top_products').refresh()
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

## When NOT to use PostgreSQL caching

Migrate to Redis when you need:

- Arbitrary key-value caching with individual TTLs per entry
- Sub-millisecond read latency at very high request volumes
- Cache invalidation at the individual row level
- Distributed caching across multiple application servers with shared state

PgShift tells you when that time comes.
