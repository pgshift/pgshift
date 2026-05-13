---
title: Migration Hints
description: How PgShift tells you when it is time to move to a specialized backend.
---

PgShift collects latency metrics for every operation. When a module consistently approaches the limits of what Postgres can handle efficiently, it emits a migration hint via a callback you configure.

## Configuration

```ts
const db = createClient({
  url: process.env.DATABASE_URL,
  metrics: true,
  onMigrationHint(hint) {
    console.warn(`Consider migrating ${hint.module} to ${hint.suggestedAdapter}.`)
    console.warn(`Reason: ${hint.reason}`)
    console.warn(`Urgency: ${hint.urgency}`) // 0 to 1
  },
})
```

## Thresholds

| Module | Metric | Threshold | Suggested adapter |
|---|---|---|---|
| search | avg query latency | over 200ms over 100 queries | elasticsearch |
| cache | avg read latency | over 50ms over 100 reads | redis |

Thresholds are conservative by design. A hint is a signal to investigate, not a command to migrate immediately.

Each hint is emitted only once per session to avoid noise.

## What migration involves

PgShift does not automate infrastructure migrations. When a hint fires, the work is yours.

For search, that typically means provisioning an Elasticsearch cluster, designing index mappings, reindexing existing data, and setting up a synchronization pipeline.

What PgShift guarantees is that your application-level API stays the same regardless of which adapter is active. The migration is infrastructure work, not application code.

## The MigrationHint type

```ts
interface MigrationHint {
  module: 'search' | 'queue' | 'cache' | 'realtime'
  currentAdapter: string
  suggestedAdapter: string
  reason: string
  urgency: number  // 0 to 1
  learnMoreUrl?: string
}
```
