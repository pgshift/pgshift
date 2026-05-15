# Testing

PgShift uses [Vitest](https://vitest.dev) for both unit and integration tests. All tests live in the `__tests__/` workspace at the root of the monorepo.

---

## Running tests

```bash
# All unit tests — no database required
npm run test:unit --workspace=__tests__

# All integration tests — requires Docker
npm run test:integration --workspace=__tests__

# All tests
npm run test --workspace=__tests__

# Single file
cd __tests__ && npx vitest run unit/search/query-builder.spec.ts
cd __tests__ && npx vitest run integration/search/search.test.ts

# Pattern match
cd __tests__ && npx vitest run unit -t "readySteps"
cd __tests__ && npx vitest run integration -t "creates the shadow table"

# Watch mode (unit only)
cd __tests__ && npx vitest unit
```

---

## Unit tests

Unit tests have no external dependencies. They test pure functions and business logic in isolation using mock adapters where needed.

**What belongs in unit tests:**
- Pure functions (DAG resolution, SQL query builders, schedule helpers, score conversion)
- `PgShiftClient` handle caching, adapter lazy initialization, and delegation
- `MetricsCollector` threshold logic and hint emission
- Error messages and validation logic

**What does not belong in unit tests:**
- Anything that requires a database connection
- Trigger installation or SQL execution
- Worker polling loops

```bash
npm run test:unit --workspace=__tests__
```

No setup required. Runs in milliseconds.

---

## Integration tests

Integration tests run against a real PostgreSQL instance inside Docker. Each test gets a completely isolated schema — no shared state between tests.

### Database setup

The test database runs on port `5499` using a custom Docker image with `pgvector` and `pg_cron` pre-installed.

`global.ts` handles the full lifecycle:
1. Checks if the `pgshift-test-postgres` image exists locally
2. If not, builds it from `__tests__/Dockerfile`
3. Starts the container with `pg_cron` enabled
4. Waits for Postgres to be ready
5. Tears down the container after all tests finish

You do not need to start or manage the container manually.

### Schema isolation

Each `it()` block creates a unique Postgres schema and drops it in `afterEach`:

```ts
beforeEach(async () => {
  pool = createPool()
  schema = await createSchema(pool)  // creates test_1234567_abc12
  url = schemaUrl(schema)            // injects search_path into connection URL
})

afterEach(async () => {
  await dropSchema(pool, schema)     // DROP SCHEMA test_1234567_abc12 CASCADE
  await pool.end()
})
```

All PgShift tables are created inside the isolated schema. Teardown is a single `DROP SCHEMA ... CASCADE` — no cleanup of individual tables needed.

### Timeouts

Integration tests that involve workers (queue, workflow) use longer timeouts because they need to wait for polling loops and backoff intervals.

The `vitest.config.ts` sets `testTimeout: 30_000` for integration tests. Individual tests involving retry or compensation extend this further via `await sleep()` calls.

```bash
npm run test:integration --workspace=__tests__
```

First run builds the Docker image (~2 minutes). Subsequent runs reuse the cached image.

---

## Writing new tests

### Unit test

Create `__tests__/unit/<module>/<name>.spec.ts`. No database, no Docker, no setup.

```ts
import { describe, expect, it } from 'vitest'
import { myPureFunction } from '../../../adapters/<module>-postgres/source/<file>.js'

describe('myPureFunction', () => {
  it('does what it should', () => {
    expect(myPureFunction('input')).toBe('expected output')
  })
})
```

### Integration test

Create `__tests__/integration/<module>/<name>.test.ts`. Use the schema isolation helpers.

```ts
import { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '../../../packages/<module>/source/index.js'
import { createPool, createSchema, dropSchema, schemaUrl } from '../setup/db.js'

describe('<module> integration', () => {
  let pool: Pool
  let schema: string
  let url: string

  beforeEach(async () => {
    pool = createPool()
    schema = await createSchema(pool)
    url = schemaUrl(schema)
  })

  afterEach(async () => {
    await dropSchema(pool, schema)
    await pool.end()
  })

  it('does something', async () => {
    const db = createClient({ url })

    // test body

    await db.destroy()
  })
})
```

### Rules for integration tests

- Always call `await db.destroy()` at the end of each `it()` block
- Create a new `db` client per test — never share across tests
- Query the database directly via `pool` to assert internal state
- Use `schemaUrl(schema)` as the connection URL for the client — never `TEST_DATABASE_URL` directly
- For worker-based tests (queue, workflow), use `await sleep(ms)` and size it generously relative to the expected backoff

---

## CI behavior

The CI runs on every push and pull request to `main` and `develop`.

```
lint       — Biome format check and lint
unit       — unit tests, no database
integration — builds Docker image, starts Postgres, runs all integration tests
```

Integration tests in CI build the Docker image from scratch on every run. The image build is cached by GitHub Actions layer caching when the `__tests__/Dockerfile` has not changed.

---

## Docker image

The test image is defined in `__tests__/Dockerfile`:

```dockerfile
FROM pgvector/pgvector:pg16

RUN apt-get update \
  && apt-get install -y postgresql-16-cron \
  && rm -rf /var/lib/apt/lists/*
```

It extends the official `pgvector/pgvector:pg16` image with `pg_cron`. The container starts with:

```
postgres
  -c shared_preload_libraries=pg_cron
  -c cron.database_name=pgshift_test
```

To rebuild the image manually:

```bash
docker build -t pgshift-test-postgres ./__tests__
```

To start it manually for debugging:

```bash
docker run -d \
  --name pgshift-test-postgres \
  -e POSTGRES_PASSWORD=pgshift_test \
  -e POSTGRES_DB=pgshift_test \
  -p 5499:5432 \
  pgshift-test-postgres \
  postgres \
  -c shared_preload_libraries=pg_cron \
  -c cron.database_name=pgshift_test
```

Connect directly:

```bash
psql postgres://postgres:pgshift_test@localhost:5499/pgshift_test
```
