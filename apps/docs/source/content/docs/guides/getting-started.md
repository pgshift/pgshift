---
title: Getting Started
description: Install PgShift and run your first search query in minutes.
---

PgShift is an open source infrastructure toolkit for Node.js applications backed by PostgreSQL.

Search, caching, queues, cron jobs, and realtime -- all inside the Postgres instance you already run. No new services to provision. No new credentials to manage.

## Requirements

- Node.js 20 or later
- PostgreSQL 12 or later

## Install

Install the module you need. Each module ships with its Postgres adapter included.

```bash
npm install @pgshift/search
```

```bash
npm install @pgshift/cache
```

```bash
npm install @pgshift/queue
```

```bash
npm install @pgshift/cron
```

## Configure

Each module exposes a `createClient` function. Pass your Postgres connection string and you are ready.

```ts
import { createClient } from '@pgshift/search'

const db = createClient({ url: process.env.DATABASE_URL })
```

## Run your first search

```ts
import { createClient } from '@pgshift/search'

const db = createClient({ url: process.env.DATABASE_URL })

// Create the search index for an entity. Idempotent, safe to call on every startup.
await db.search('products').index({
  fields: ['name', 'description', 'category'],
  weights: { name: 'A', description: 'B', category: 'C' },
  fuzzy: true,
})

// Index a document
await db.search('products').upsert('1', {
  name: 'Nike Air Max 90',
  description: 'Classic sneaker with visible Air unit.',
  category: 'shoes',
})

// Search
const results = await db.search('products').query('air max', {
  fuzzy: true,
  filters: { category: 'shoes' },
  limit: 10,
})

console.log(results)
// [{ id: '1', rank: 0.626, data: { name: 'Nike Air Max 90', ... } }]

// Drain connections on shutdown
await db.destroy()
```

## Next steps

- [Search module](/modules/search) -- full API reference
- [Cache module](/modules/cache) -- materialized view caching
- [Queue module](/modules/queue) -- background job processing
- [Cron module](/modules/cron) -- recurring job scheduling
- [Migration Hints](/guides/migration-hints) -- how PgShift tells you when to move on
