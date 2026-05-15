# @pgshift/state

> State machines, data normalization, audit logs, and consensus gates for PostgreSQL.
> Enforced at the database level via triggers.

<div align="left">

[![npm version](https://img.shields.io/npm/v/@pgshift/state)](https://www.npmjs.com/package/@pgshift/state)
[![license](https://img.shields.io/npm/l/@pgshift/state)](https://github.com/mkafonso/pgshift)
[![downloads](https://img.shields.io/npm/dm/@pgshift/state)](https://www.npmjs.com/package/@pgshift/state)

</div>

---

## Why?

Every application has business rules. Most of them live in the API layer.

The problem is that the API is not the only path into your database. Scripts bypass it. Migrations bypass it. Admins with psql bypass it. Internal workers with their own database connections bypass it. Every one of those paths is an opportunity for data to end up in an invalid state.

`@pgshift/state` moves the rules down into the database itself via triggers. No matter who writes to the table, the rules are enforced on every write, from every source, unconditionally.

---

## Install

```bash
npm install @pgshift/state
```

---

## Quick start

```ts
import { createClient, normalizers } from '@pgshift/state'

const db = createClient({ url: process.env.DATABASE_URL })

await db.state('loans')
  .define({
    field: 'status',
    states: ['pending', 'approved', 'rejected', 'paid'],
    transitions: {
      pending:  ['approved', 'rejected'],
      approved: ['paid'],
      rejected: [],
      paid:     [],
    },
    initial: 'pending',
  })
  .normalize({ amount: 'ABS({value})' })
  .audit({ track: ['status', 'amount'] })
  .consensus({
    transition: 'approved',
    require: 2,
    roles: ['finance', 'manager'],
    when: 'NEW.amount > 10000000',
  })

await db.destroy()
```

---

## Features

- State machines enforced via `BEFORE UPDATE` triggers
- Data normalization via `BEFORE INSERT OR UPDATE` triggers
- Immutable audit logs via `AFTER INSERT OR UPDATE` triggers
- Consensus gates requiring N approvals before a transition
- Each method is independent — use only what you need, in any order
- Built-in normalizers for common cases
- TypeScript types for all inputs and outputs

---

## Architecture

```txt
Application (or script, migration, admin, worker)
     |
PostgreSQL
 |-- BEFORE UPDATE trigger    (.define)
 |-- BEFORE INSERT OR UPDATE  (.normalize)
 |-- AFTER INSERT OR UPDATE   (.audit)
 |-- BEFORE UPDATE trigger    (.consensus)
```

---

## Four independent capabilities

### `.define()` — State machine

Installs a trigger that enforces valid state transitions on every write.

```ts
await db.state('loans').define({
  field: 'status',
  states: ['pending', 'approved', 'rejected', 'paid'],
  transitions: {
    pending:  ['approved', 'rejected'],
    approved: ['paid'],
    rejected: [],
    paid:     [],
  },
  initial: 'pending',
})
```

Invalid transitions are rejected with a clear error:

```
ERROR: [PgShift] Invalid state transition on table "loans": "paid" -> "pending" is not allowed.
```

---

### `.normalize()` — Data normalization

Installs a trigger that normalizes field values on every `INSERT` or `UPDATE`.

```ts
import { normalizers } from '@pgshift/state'

await db.state('users').normalize({
  email: normalizers.email,   // LOWER(TRIM(value))
  name:  normalizers.name,    // TRIM + collapse spaces
  phone: normalizers.phone,   // remove non-digits
})
```

Built-in normalizers: `normalizers.email`, `normalizers.name`, `normalizers.phone`, `normalizers.trim`, `normalizers.lowercase`, `normalizers.uppercase`.

Custom SQL expressions using `{value}` as placeholder:

```ts
await db.state('products').normalize({
  slug: "LOWER(REGEXP_REPLACE(TRIM({value}), '[^a-z0-9]+', '-', 'g'))",
})
```

---

### `.audit()` — Immutable audit log

Installs a trigger that writes an immutable entry to `_pgshift_state_audit` for every change.

```ts
await db.state('loans').audit({
  track: ['status', 'amount'],  // omit to track all columns
})

const history = await db.state('loans').history('loan-123')
// [{ field: 'status', fromValue: 'pending', toValue: 'approved', changedAt: Date }]
```

---

### `.consensus()` — Consensus gate

Installs a trigger that blocks a specific transition until the required number of approvals are recorded.

```ts
await db.state('loans').consensus({
  transition: 'approved',
  require: 2,
  roles: ['finance', 'manager'],
  when: 'NEW.amount > 10000000',
})

await db.state('loans').approve('loan-123', { by: 'alice', role: 'finance' })
await db.state('loans').approve('loan-123', { by: 'bob',   role: 'manager' })

// Now the transition is allowed
await pool.query(`UPDATE loans SET status = 'approved' WHERE id = 'loan-123'`)
```

The `when` condition is evaluated inside the trigger with access to `NEW.*`. When false, the consensus check is skipped and the transition proceeds normally.

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

### `db.state(table).define(config)`

| Option | Type | Description |
|---|---|---|
| `field` | `string` | Column that holds the state value |
| `states` | `string[]` | All valid state values |
| `transitions` | `Record<string, string[]>` | Allowed transitions per state |
| `initial` | `string` | Default value set on INSERT if the field is null |

---

### `db.state(table).normalize(config)`

Map of field name to SQL expression. Use `{value}` as placeholder for the field value.

---

### `db.state(table).audit(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `track` | `string[]` | all columns | Fields to include in the audit log |

---

### `db.state(table).consensus(config)`

| Option | Type | Description |
|---|---|---|
| `transition` | `string` | Target state that requires consensus |
| `require` | `number` | Number of approvals required |
| `roles` | `string[]` | Optional. Roles allowed to approve. |
| `when` | `string` | Optional SQL condition evaluated inside the trigger |

---

### `db.state(table).approve(entityId, options)`

Records an approval for a given entity.

```ts
await db.state('loans').approve('loan-123', { by: 'alice', role: 'finance' })
```

---

### `db.state(table).history(entityId)`

Returns the audit log for a given entity.

```ts
const history = await db.state('loans').history('loan-123')
```

---

### `db.state(table).pendingApprovals(entityId)`

Returns all recorded approvals for a given entity.

```ts
const approvals = await db.state('loans').pendingApprovals('loan-123')
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
