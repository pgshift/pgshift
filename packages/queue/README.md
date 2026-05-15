# @pgshift/queue

> Background job processing for PostgreSQL.
> No Redis or RabbitMQ required.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/queue)](https://www.npmjs.com/package/@pgshift/queue)
[![license](https://img.shields.io/npm/l/@pgshift/queue)](https://github.com/mkafonso/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/queue)](https://www.npmjs.com/package/@pgshift/queue)

</div>

---

## Why?

Background jobs are one of the first things teams reach for a separate service to handle. Redis, RabbitMQ, SQS — all of them require new infrastructure before you have shipped anything.

PostgreSQL has been capable of reliable job queues for years via `SKIP LOCKED`. Most teams just do not know it. `@pgshift/queue` gives you at-least-once delivery, retries, priority, delay, and a dead letter queue — all inside the Postgres instance you already run.

---

## Install

```bash
npm install @pgshift/queue
```

---

## Quick start

```ts
import { createClient } from '@pgshift/queue'

const db = createClient({ url: process.env.DATABASE_URL })

await db.queue('emails').setup()

await db.queue('emails').push(
  { to: 'user@example.com', subject: 'Welcome' },
  { priority: 1, retries: 3 },
)

await db.queue('emails').process(async (job) => {
  await sendEmail(job.payload)
})

process.on('SIGTERM', async () => {
  await db.destroy()
  process.exit(0)
})
```

---

## Features

- At-least-once job delivery via `SKIP LOCKED`
- Automatic retries with exponential backoff
- Priority ordering — higher number processed first
- Delayed jobs via `run_at`
- Dead letter queue — failed jobs preserved for inspection
- Job cancellation for pending jobs
- Queue stats per status
- Zero external infrastructure
- Migration hints when average job lag consistently exceeds thresholds
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application
     |
@pgshift/queue
     |
PostgreSQL
 |-- _pgshift_queue_{name}   (job table)
      |
      | SKIP LOCKED
      |
Worker polls and processes jobs
```

---

## Delivery guarantee

At-least-once delivery. A job may be processed more than once if a worker crashes before marking it as done. Make your handlers idempotent.

---

## Retry behavior

Failed jobs are retried with exponential backoff:

| Attempt | Backoff |
|---|---|
| 1 | 2 seconds |
| 2 | 4 seconds |
| 3 | 8 seconds |
| N | min(2^N seconds, 30 seconds) |

After all retry attempts are exhausted, the job moves to `failed` status and is preserved in the queue table for inspection.

---

## Dead letter queue

Failed jobs are not deleted. Query them directly for debugging:

```ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const { rows } = await pool.query(`
  SELECT id, payload, attempts, error, failed_at
  FROM _pgshift_queue_emails
  WHERE status = 'failed'
  ORDER BY failed_at DESC
`)
```

---

## Migration hints

PgShift tracks average job processing lag. When it consistently exceeds 5 seconds, it emits a migration hint.

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

### `db.queue(name).setup()`

Creates the queue table and indexes. Idempotent, safe to call on every startup.

```ts
await db.queue('emails').setup()
```

---

### `db.queue(name).push(payload, options?)`

Inserts a job into the queue. Returns the job ID.

```ts
const jobId = await db.queue('emails').push(
  { to: 'user@example.com' },
  { priority: 1, retries: 3, delay: 5000 },
)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `priority` | `number` | `0` | Higher number processed first |
| `retries` | `number` | `3` | Max retry attempts before dead letter |
| `delay` | `number` | `0` | Milliseconds before the job becomes visible |

---

### `db.queue(name).process(handler)`

Starts a polling worker. The handler runs for each job.

```ts
await db.queue('emails').process(async (job) => {
  await sendEmail(job.payload)
})
```

The `job` object:

```ts
interface QueueJob<T> {
  id: string
  payload: T
  status: 'processing'
  attempts: number
  maxRetries: number
  priority: number
  runAt: Date
  createdAt: Date
}
```

If the handler throws, the job is retried with exponential backoff. After exhausting retries, it moves to `failed`.

---

### `db.queue(name).cancel(jobId)`

Cancels a pending job. Has no effect on jobs that are already processing.

```ts
await db.queue('emails').cancel(jobId)
```

---

### `db.queue(name).stats()`

Returns counts per status for the queue.

```ts
const stats = await db.queue('emails').stats()
// { pending: 10, processing: 2, done: 847, failed: 1 }
```

---

### `db.destroy()`

Stops the worker and drains the connection pool. Waits for in-flight jobs to complete.

```ts
process.on('SIGTERM', async () => {
  await db.destroy()
  process.exit(0)
})
```

---

## When NOT to use PostgreSQL queues

Migrate to BullMQ, SQS, or RabbitMQ when you need:

- Millions of jobs per minute
- Sub-second job latency at very high throughput
- Fan-out to multiple consumers per message
- Exactly-once delivery guarantees
- Multi-region queue distribution

PgShift tells you when that time comes.
