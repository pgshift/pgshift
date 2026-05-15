# @pgshift/cron

> Recurring job scheduling for PostgreSQL.
> No external scheduler required.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/cron)](https://www.npmjs.com/package/@pgshift/cron)
[![license](https://img.shields.io/npm/l/@pgshift/cron)](https://github.com/mkafonso/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/cron)](https://www.npmjs.com/package/@pgshift/cron)

</div>

---

## Why?

Recurring tasks are everywhere. Send weekly digests. Clean up expired records. Generate monthly reports. Most teams pay for an external scheduler or wire up their own cron infrastructure.

If you already have PostgreSQL and `@pgshift/queue`, you have everything you need. `@pgshift/cron` uses the `pg_cron` extension to schedule recurring jobs. When a job fires, it inserts a payload into a queue table so your existing worker processes it. No extra process. No new service.

---

## Requirements

- `@pgshift/queue` — required. Jobs fire as queue entries.
- `pg_cron` extension on your PostgreSQL server. Available on Amazon RDS, Supabase, and Tembo. Not available on serverless providers with scale-to-zero.

---

## Install

```bash
npm install @pgshift/cron @pgshift/queue
```

---

## Quick start

```ts
import { createClient, schedule } from '@pgshift/cron'
import { createClient as createQueueClient } from '@pgshift/queue'

const cron = createClient({
  url: process.env.DATABASE_URL,
  queue: 'tasks',
})
const queue = createQueueClient({ url: process.env.DATABASE_URL })

await cron.cron.setup()
await queue.queue('tasks').setup()

await cron.cron('weekly-digest').schedule(
  schedule.weekly({ day: 'monday', hour: 8 }),
  { payload: { type: 'weekly-digest' } },
)

await queue.queue('tasks').process(async (job) => {
  const { type } = job.payload as { type: string }
  if (type === 'weekly-digest') await sendWeeklyDigest()
})

process.on('SIGTERM', async () => {
  await cron.destroy()
  await queue.destroy()
  process.exit(0)
})
```

---

## Features

- Schedule recurring jobs via `pg_cron` — stored and managed inside PostgreSQL
- Jobs fire as queue entries — processed by your existing `@pgshift/queue` worker
- Human-readable schedule helpers: `schedule.daily()`, `schedule.weekly()`, etc.
- Raw cron expressions also accepted
- Zero extra processes or services
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application
     |
@pgshift/cron
     |
pg_cron (inside PostgreSQL)
     |
     | fires at scheduled time
     |
_pgshift_queue_{name} (INSERT)
     |
@pgshift/queue worker
     |
Your handler function
```

---

## Schedule builder

The `schedule` helper builds standard cron expressions from readable options.

```ts
import { schedule } from '@pgshift/cron'

schedule.every({ minutes: 5 })              // "*/5 * * * *"
schedule.every({ hours: 2 })               // "0 */2 * * *"
schedule.hourly({ minute: 30 })            // "30 * * * *"
schedule.daily({ hour: 8 })               // "0 8 * * *"
schedule.daily({ hour: 8, minute: 30 })   // "30 8 * * *"
schedule.weekly({ day: 'monday', hour: 9 }) // "0 9 * * 1"
schedule.monthly({ day: 1, hour: 0 })      // "0 0 1 * *"
```

Raw cron strings are also accepted:

```ts
await cron.cron('every-five').schedule('*/5 * * * *', {
  payload: { type: 'poll' },
})
```

All schedules run in UTC.

---

## Per-job queue override

Send a specific job to a different queue than the default:

```ts
await cron.cron('monthly-report').schedule(
  schedule.monthly({ day: 1, hour: 9 }),
  {
    queue: 'reports',
    payload: { type: 'monthly-report' },
  },
)
```

---

## API

### `createClient(options)`

```ts
const cron = createClient({
  url: process.env.DATABASE_URL,
  queue: 'tasks',   // default queue for all cron jobs
  max: 10,
  ssl: { rejectUnauthorized: false },
})
```

---

### `cron.cron.setup()`

Ensures the `pg_cron` extension is installed. Idempotent, safe to call on every startup.

```ts
await cron.cron.setup()
```

---

### `cron.cron(name).schedule(expr, options)`

Creates or replaces a cron job. When the job fires, a payload is inserted into the target queue.

```ts
await cron.cron('weekly-digest').schedule(
  schedule.weekly({ day: 'monday', hour: 8 }),
  { payload: { type: 'weekly-digest' } },
)
```

| Option | Type | Description |
|---|---|---|
| `payload` | `object` | Arbitrary JSON passed to the queue job |
| `queue` | `string` | Queue to push into. Defaults to the client-level `queue`. |

---

### `cron.cron(name).unschedule()`

Removes a scheduled job by name.

```ts
await cron.cron('weekly-digest').unschedule()
```

---

### `cron.cron.list()`

Returns all PgShift-managed cron jobs.

```ts
const jobs = await cron.cron.list()
// [{ name: 'weekly-digest', schedule: '0 8 * * 1', active: true, jobId: 9 }]
```

---

### `cron.destroy()`

Drains the connection pool. Always call on process exit alongside `queue.destroy()`.

```ts
process.on('SIGTERM', async () => {
  await cron.destroy()
  await queue.destroy()
  process.exit(0)
})
```

---

## When NOT to use pg_cron

Use a different scheduler when:

- Your PostgreSQL provider does not support `pg_cron` (Neon, PlanetScale)
- Your database scales to zero and may be paused when the job should fire
- You need sub-minute scheduling
- You need to run code that does not involve the database at all
