# AGENTS.md

>Meta note: This is the primary agent knowledge base file. CLAUDE.md and GEMINI.md are symlinks to this file - always edit AGENTS.md directly. When learning something new about the codebase that would help with future tasks, update this file immediately.

## What this is

PgShift is a TypeScript monorepo of npm packages that expose a clean, consistent API over native PostgreSQL capabilities to replace Redis, Kafka, Elasticsearch, Pinecone, Temporal, and similar services — without changing application code when migration eventually happens.

**Tagline:** Start with Postgres. Shift only when you must.

---

## Commands

```bash
# Build
npm run build                                      # build all packages via Turborepo
npx turbo build --filter=@pgshift/search           # build a single package

# Lint and format
npm run lint                                       # lint all packages (Biome)
npm run format                                     # format all packages (Biome)

# Tests
npm run test:unit --workspace=__tests__            # unit tests — no database needed
npm run test:integration --workspace=__tests__     # integration tests — requires Docker

# Run a single test file
cd __tests__ && npx vitest run unit/search/query-builder.spec.ts
cd __tests__ && npx vitest run integration/search/search.test.ts
cd __tests__ && npx vitest run integration/workflow/workflow.test.ts

# Run tests matching a pattern
cd __tests__ && npx vitest run unit -t "readySteps"

# Bump all dependencies to latest across monorepo
make update

# Release
npx changeset          # add a changeset before committing a change
npx changeset version  # apply pending changesets (done by CI automatically)
```

Integration tests auto-spin a Docker container on port 5499 using the custom image in `__tests__/Dockerfile` (pgvector/pg16 + pg_cron). No manual Postgres setup is needed locally.

---

## Monorepo layout

```
packages/          Public-facing packages — what users install
adapters/          Internal Postgres adapter implementations — never installed directly
tooling/lint/      Shared Biome config
tooling/ts/        Shared TypeScript config
apps/docs/         Documentation site (Astro + Starlight)
examples/          Runnable usage examples
__tests__/         Centralized test suite (unit + integration)
.changeset/        Pending changesets for the next release
.github/workflows/ CI (ci.yml) and release (release.yml)
```

Build tool: **Turborepo + tsdown**. All packages output ESM only (`dist/index.mjs` + `dist/index.d.mts`).
Linter/formatter: **Biome** — not ESLint or Prettier.
Test runner: **Vitest**.

---

## Architecture

### Three-layer structure

```
packages/<module>              ← public entry point — what users install
    |
adapters/<module>-postgres     ← internal — implements the adapter interface
    |
packages/core                  ← foundation — types, PgShiftClient, MetricsCollector
```

**Layer 1 — `@pgshift/core`**

The foundation. Contains:
- `PgShiftClient` — fluent client that lazily instantiates adapters and caches handles
- All TypeScript types and adapter interfaces (`SearchAdapter`, `CacheAdapter`, `QueueAdapter`, `CronAdapter`, `VectorAdapter`, `StateAdapter`, `WorkflowAdapter`)
- `MetricsCollector` — tracks latency and fires migration hints
- No runtime Postgres dependency

**Layer 2 — `adapters/<module>-postgres`**

Internal packages named `@pgshift/adapter-<module>-postgres`. Each implements the adapter interface from core using the `pg` driver.

Standard file structure per adapter:
```
adapter.ts     — implements the adapter interface, calls schema/pool/helpers
pool.ts        — PgPool class wrapping pg.Pool with typed query method
schema.ts      — idempotent DDL (CREATE TABLE/INDEX IF NOT EXISTS)
index.ts       — factory function exported to packages/<module>
```

Module-specific helpers:
```
query-builder.ts   (search) — builds tsvector queries and fuzzy match SQL
transitions.ts     (state)  — installs state machine triggers
normalizer.ts      (state)  — installs normalization triggers
audit.ts           (state)  — installs audit log triggers
consensus.ts       (state)  — installs consensus gate triggers
dag.ts             (workflow) — topological sort, readySteps, validateDag
executor.ts        (workflow) — advances a run by dispatching ready steps
compensator.ts     (workflow) — runs compensation in reverse topological order
worker.ts          (workflow, queue) — SKIP LOCKED polling loop
schedule.ts        (cron)   — human-readable cron expression builder
```

**Layer 3 — `packages/<module>`**

Public entry point. Each exports a `createClient()` factory:

```ts
// packages/search/source/index.ts
return new PgShiftClient({
  config,
  adapters: {
    search: () => createPostgresSearchAdapter(config),
  },
})
```

`PgShiftClient` lazily instantiates adapters on first use and caches handles per entity/queue/table name. Calling an unregistered adapter throws immediately with a clear message pointing to the correct install command.

---

## Module internals

### Search (`@pgshift/search`)

Shadow table per entity: `_pgshift_search_<entity>`

```sql
CREATE TABLE _pgshift_search_<entity> (
  id         TEXT PRIMARY KEY,
  search_vec TSVECTOR,
  raw_text   TEXT,
  data       JSONB,
  updated_at TIMESTAMPTZ
)
```

Config table: `_pgshift_search_config` — stores fields, weights, language per entity.

Fuzzy search uses `word_similarity` from `pg_trgm`, comparing each word in the query individually. The `pg_trgm` extension is enabled automatically when `fuzzy: true`.

Standard search uses `plainto_tsquery`. Filters apply as equality checks against the JSONB `data` column.

### Cache (`@pgshift/cache`)

Materialized view per name: `_pgshift_cache_<name>`

Config table: `_pgshift_cache_config` — stores query, refresh interval, last refresh timestamp.

The `_pgshift_id` convention: aliasing a unique column as `_pgshift_id` enables `REFRESH MATERIALIZED VIEW CONCURRENTLY`, which does not block reads. Without it, refresh is blocking.

### Queue (`@pgshift/queue`)

Job table per queue: `_pgshift_queue_<name>`

```sql
CREATE TABLE _pgshift_queue_<name> (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  priority    INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at   TIMESTAMPTZ,
  locked_by   TEXT,
  failed_at   TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Worker uses `SELECT ... FOR UPDATE SKIP LOCKED` to claim jobs. Exponential backoff: `min(2^attempts seconds, 30s)`. Reaper reclaims jobs locked for more than 30 seconds.

### Cron (`@pgshift/cron`)

Requires `@pgshift/queue`. The `schedule()` method calls `cron.schedule()` which inserts an SQL statement into `pg_cron` that inserts a row into the target queue table when it fires.

All cron jobs are prefixed `pgshift:` in `cron.job` to avoid conflicts.

Schedule helper in `adapters/cron-postgres/source/schedule.ts` — also re-exported from `packages/cron`.

### Vector (`@pgshift/vector`)

Vector table per entity: `_pgshift_vector_<entity>`

```sql
CREATE TABLE _pgshift_vector_<entity> (
  id         TEXT PRIMARY KEY,
  embedding  vector(<dimensions>) NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

HNSW index uses `vector_cosine_ops`, `vector_l2_ops`, or `vector_ip_ops` depending on metric.

Distance operators: cosine `<=>`, euclidean `<->`, dotproduct `<#>`.
Score conversion: cosine `1 - distance`, euclidean `1 / (1 + distance)`, dotproduct `1 + distance`.

Config table: `_pgshift_vector_config` — stores dimensions and metric per entity.

Hybrid search: equality filters are appended as `AND data->>'key' = $N` alongside the `ORDER BY embedding <=> $1` clause.

### State (`@pgshift/state`)

Each method is independent and installs its own trigger. All triggers are idempotent via `CREATE OR REPLACE FUNCTION` and `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`.

- `.define()` — `BEFORE INSERT OR UPDATE` trigger, validates transitions via a CASE expression
- `.normalize()` — `BEFORE INSERT OR UPDATE` trigger, applies SQL expressions to fields using `{value}` placeholder
- `.audit()` — `AFTER INSERT OR UPDATE` trigger, writes to `_pgshift_state_audit` (shared across all tables)
- `.consensus()` — `BEFORE UPDATE` trigger, counts rows in `_pgshift_consensus_<table>_<transition>` before allowing the transition. Supports `when` as a raw SQL condition evaluated inside the trigger.

### Workflow (`@pgshift/workflow`)

Three tables:
- `_pgshift_workflow_definitions` — stores DAG config as JSONB
- `_pgshift_workflow_runs` — one row per execution
- `_pgshift_workflow_steps` — one row per step per run, claimed via SKIP LOCKED

DAG resolution (`dag.ts`):
- `validateDag()` — runs on `define()`, throws on cycles or undefined dependencies
- `readySteps()` — returns steps with status `pending` where all dependencies are `completed`
- `topologicalSort()` — used to determine compensation order (reverse)
- `compensationOrder()` — filters to completed steps with `compensate` defined, reverses

Executor loop (`executor.ts`):
1. Load step statuses for a run
2. If any step is `failed` → trigger compensation
3. If all steps are `completed` or `skipped` → mark run as `completed`
4. Otherwise → dispatch ready steps via `dispatchStep()`

Compensation (`compensator.ts`):
1. Mark run as `compensating`
2. Find completed steps with compensation handlers
3. Run in reverse topological order
4. Mark run as `compensated`

Worker poll interval: 200ms.

---

## Integration test isolation

Each integration test creates a unique Postgres schema (`test_<timestamp>_<random>`) via `createSchema(pool)` in `__tests__/integration/setup/db.ts`.

The `schemaUrl(schema)` function injects `search_path=<schema>` into the connection string options parameter. All PgShift tables land inside the isolated schema.

Teardown is a single `DROP SCHEMA <schema> CASCADE`.

The Docker image is built automatically by `global.ts` on first run if `pgshift-test-postgres` does not exist locally.

---

## Style rules — absolute

- Never use `—` (em dash) in any text, comments, or documentation. Use a plain hyphen or rewrite the sentence.
- No emojis in code comments or documentation markdown files.
- English for all code comments and documentation.
- All packages output ESM only — no CJS.
- Use `Awaitable<T>` (from `@pgshift/core`) for adapter interface return types, not `Promise<T>`.
- Adapter implementations receive a `PgPool` instance, not a raw `pg.Pool`.
- Never expose internal adapter packages in public API or documentation.
- The `pool.ts` in each adapter is a thin wrapper — all business logic lives in `adapter.ts`, `schema.ts`, and helpers.

---

## Adding a new module

1. Add adapter interface and types to `packages/core/source/types.ts`
2. Add `PgShiftModule` union type entry if migration hints apply
3. Add adapter factory and handle class to `packages/core/source/client.ts`
4. Create `adapters/<module>-postgres/source/` with `pool.ts`, `schema.ts`, `adapter.ts`, `index.ts`
5. Create `packages/<module>/source/index.ts` with `createClient()` factory
6. Add examples under `examples/<module>-*/`
7. Add integration tests under `__tests__/integration/<module>/`
8. Add unit tests under `__tests__/unit/<module>/`
9. Add documentation page at `apps/docs/source/content/docs/modules/<module>.mdx`
10. Add adapter documentation at `apps/docs/source/content/docs/adapters/<module>-postgres.md`
11. Update `apps/docs/astro.config.mjs` sidebar
12. Update `apps/docs/public/llms.txt`
13. Add changeset with `npx changeset`

---

## Releasing

Releases use Changesets.

```bash
# After implementing a feature or fix
npx changeset
# Select affected packages, choose bump type, write a description

git add .changeset/
git commit -m "feat: description of change"
git push
```

The CI detects pending changesets and opens a "chore: version packages" PR. Merging that PR triggers `release.yml` which publishes all changed packages to npm.

Examples, tooling, docs, and `__tests__` are excluded from changesets via `.changeset/config.json`.
