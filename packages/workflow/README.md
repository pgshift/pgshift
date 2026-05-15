# @pgshift/workflow

> DAG-based workflow orchestration for PostgreSQL.
> No Temporal or Step Functions required.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/workflow)](https://www.npmjs.com/package/@pgshift/workflow)
[![license](https://img.shields.io/npm/l/@pgshift/workflow)](https://github.com/pgshift/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/workflow)](https://www.npmjs.com/package/@pgshift/workflow)

</div>

---

## Why?

Most teams manage multi-step processes with sequential `await` chains. That works until one step fails mid-way, the process restarts, the server crashes, or two workers try to process the same job simultaneously.

Then you need retries, idempotency, state persistence, and compensation logic — all bolted on after the fact.

`@pgshift/workflow` gives you durable workflow orchestration backed by PostgreSQL. Define your steps and their dependencies as a DAG. The engine handles execution order, parallelism, retries, and saga-pattern compensation when things go wrong.

---

## Install

```bash
npm install @pgshift/workflow
```

---

## Quick start

```ts
import { createClient } from '@pgshift/workflow'

const db = createClient({ url: process.env.DATABASE_URL })

await db.workflow('order-fulfillment').define({
  steps: {
    validate_stock:   { handler: 'validateStock',   retries: 3 },
    validate_fraud:   { handler: 'validateFraud',   retries: 3 },
    charge_card:      { handler: 'chargeCard',      retries: 1, compensate: 'refundCard' },
    emit_invoice:     { handler: 'emitInvoice',     retries: 3, compensate: 'voidInvoice' },
    send_email:       { handler: 'sendEmail',       retries: 5 },
    update_analytics: { handler: 'updateAnalytics', retries: 5 },
  },
  dag: {
    validate_stock:   [],
    validate_fraud:   [],
    charge_card:      ['validate_stock', 'validate_fraud'],
    emit_invoice:     ['charge_card'],
    send_email:       ['emit_invoice'],
    update_analytics: ['emit_invoice'],
  },
})

await db.workflow('order-fulfillment').handlers({
  validateStock:   async (ctx) => { return { reservationId: 'res-123' } },
  validateFraud:   async (ctx) => { return { approved: true } },
  chargeCard:      async (ctx) => { return { chargeId: 'ch-456' } },
  refundCard:      async (ctx) => { /* compensation */ },
  emitInvoice:     async (ctx) => { return { invoiceId: 'inv-789' } },
  voidInvoice:     async (ctx) => { /* compensation */ },
  sendEmail:       async (ctx) => { },
  updateAnalytics: async (ctx) => { },
})

await db.workflow('order-fulfillment').work()

const runId = await db.workflow('order-fulfillment').run({
  orderId: 'order-123',
  amount: 299.99,
})

process.on('SIGTERM', () => db.destroy())
```

---

## Features

- DAG-based step definition with explicit dependency declarations
- Parallel execution of independent steps
- At-least-once step execution via `SKIP LOCKED`
- Exponential backoff retries per step
- Saga-pattern compensation in reverse topological order
- Full run and step status visibility
- State persisted in PostgreSQL — survives restarts
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application
     |
@pgshift/workflow
     |
PostgreSQL
 |-- _pgshift_workflow_definitions  (DAG config)
 |-- _pgshift_workflow_runs         (one per execution)
 |-- _pgshift_workflow_steps        (one per step per run)
      |
      | SKIP LOCKED
      |
Worker polls and dispatches ready steps
```

---

## Execution model

Steps with no dependencies start immediately and in parallel. Steps with dependencies wait until all their dependencies are completed.

```
validate_stock  --|
                  |--> charge_card --> emit_invoice --> send_email
validate_fraud  --|                                 \-> update_analytics
```

`validate_stock` and `validate_fraud` run in parallel. `charge_card` waits for both. `send_email` and `update_analytics` run in parallel after `emit_invoice`.

---

## Compensation

When a step exhausts its retries, the run enters `compensating` status. PgShift runs the `compensate` handlers of completed steps in reverse execution order.

```
charge_card completed  (compensate: refundCard)
emit_invoice failed    (exhausted retries)

Compensation:
  1. voidInvoice    <- emit_invoice's compensate (failed, no-op)
  2. refundCard     <- charge_card's compensate
```

Only completed steps with a `compensate` handler defined are compensated.

---

## The `ctx` object

Available in every handler:

| Field | Type | Description |
|---|---|---|
| `ctx.runId` | `string` | Current run ID |
| `ctx.step` | `string` | Current step name |
| `ctx.input` | `object` | Payload passed to `run()` |
| `ctx.attempt` | `number` | Current attempt number (1-based) |
| `ctx.previousSteps` | `object` | Output of completed steps, keyed by step name |

---

## Retry behavior

| Attempt | Backoff |
|---|---|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| N | min(2^N seconds, 30 seconds) |

---

## API

### `createClient(options)`

```ts
const db = createClient({
  url: process.env.DATABASE_URL,
  max: 10,
  ssl: { rejectUnauthorized: false },
})
```

---

### `db.workflow(name).define(config)`

Registers the workflow definition. Idempotent, safe to call on every startup.

| Step option | Type | Default | Description |
|---|---|---|---|
| `handler` | `string` | required | Name of the registered handler function |
| `retries` | `number` | `3` | Max retry attempts before permanent failure |
| `compensate` | `string` | none | Name of the compensation handler |

---

### `db.workflow(name).handlers(handlers)`

Registers handler functions. Must be called before `.work()`.

```ts
await db.workflow('order-fulfillment').handlers({
  validateStock: async (ctx) => {
    const { items } = ctx.input as { items: string[] }
    return { reservationId: 'res-123' }
  },
})
```

---

### `db.workflow(name).work()`

Starts the polling worker. Call once on startup after `define()` and `handlers()`.

---

### `db.workflow(name).run(input?)`

Creates a new workflow run. Returns the run ID.

```ts
const runId = await db.workflow('order-fulfillment').run({
  orderId: 'order-123',
  amount: 299.99,
})
```

---

### `db.workflow(name).status(runId)`

Returns the current status of a run and all its steps.

```ts
const status = await db.workflow('order-fulfillment').status(runId)
// {
//   runId, workflow, status: 'running' | 'completed' | 'failed' | 'compensated',
//   steps: { validate_stock: { status, attempts, output }, ... }
// }
```

---

### `db.destroy()`

Drains the connection pool and stops the worker. Always call on process exit.

```ts
process.on('SIGTERM', async () => {
  await db.destroy()
  process.exit(0)
})
```

---

## Important: make handlers idempotent

`@pgshift/workflow` guarantees at-least-once step execution. A step may be retried if a worker crashes mid-execution. Make your handlers idempotent so that running them more than once produces the same result.

---

## When NOT to use PostgreSQL workflows

Migrate to Temporal or Step Functions when you need:

- Sub-second step scheduling
- Human approval gates between steps with indefinite wait times
- Thousands of concurrent workflow executions
- Cross-region workflow coordination
- Complex branching logic based on step outputs
