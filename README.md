# PgShift

**Start with Postgres. Shift only when you must.**

Most teams reach for Redis, Kafka, Elasticsearch, and Pinecone before they actually need them. The result is fragile distributed infrastructure that costs more to operate than the product earns.

PostgreSQL already handles most of what those services do. PgShift gives you a clean, consistent API on top of those capabilities — and tells you exactly when it is time to move on.

---

## Modules

| Package | Replaces | Postgres primitive |
|---|---|---|
| [`@pgshift/search`](./packages/search) | Elasticsearch, Typesense | TSVector + pg_trgm |
| [`@pgshift/cache`](./packages/cache) | Redis (read-heavy) | Materialized views |
| [`@pgshift/queue`](./packages/queue) | BullMQ, SQS, RabbitMQ | SKIP LOCKED |
| [`@pgshift/cron`](./packages/cron) | EventBridge, cron services | pg_cron |
| [`@pgshift/vector`](./packages/vector) | Pinecone, Weaviate | pgvector + HNSW |
| [`@pgshift/state`](./packages/state) | Custom trigger logic | Triggers + RLS |
| [`@pgshift/workflow`](./packages/workflow) | Temporal, Step Functions | SKIP LOCKED + JSONB |

Each module is independent. Install only what you need.

---

## Quick look

```ts
import { createClient } from '@pgshift/search'

const db = createClient({ url: process.env.DATABASE_URL })

await db.search('products').index({ fields: ['name', 'description'], fuzzy: true })
await db.search('products').upsert('1', { name: 'Nike Air Max 90', category: 'shoes' })

const results = await db.search('products').query('air maxx', {
  fuzzy: true,
  filters: { category: 'shoes' },
})
```

Same pattern across every module. One database. One connection string.

---

## When Postgres is not enough

PgShift tracks latency for every operation. When a module consistently hits the limits of what Postgres can handle efficiently, it tells you:

```ts
const db = createClient({
  url: process.env.DATABASE_URL,
  onMigrationHint(hint) {
    console.warn(`Consider migrating ${hint.module} to ${hint.suggestedAdapter}.`)
  },
})
```

When that time comes, the migration is infrastructure work — not application code. Your `db.search().query()` calls stay exactly the same regardless of which adapter is active.

---

## Documentation

[pgshift.dev](https://pgshift.dev)
