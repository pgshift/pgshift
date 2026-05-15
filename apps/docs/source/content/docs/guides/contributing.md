---
title: Contributing
description: How to contribute to PgShift.
---

Contributions are welcome. Please open an issue before submitting a pull request for non-trivial changes.

## Setup

```bash
git clone https://github.com/pgshift/pgshift
cd pgshift
npm install
npm run build
```

## Project structure

```
packages/          # Public modules — @pgshift/search, @pgshift/cache, @pgshift/queue
adapters/          # Internal adapters — search-postgres, cache-postgres, queue-postgres
examples/          # Runnable examples
__tests__/         # Unit and integration tests
apps/docs/         # This documentation site
tooling/           # Shared tsconfig and lint config
```

## Running examples

```bash
npm run dev --workspace=examples/search-basic
npm run dev --workspace=examples/cache-basic
npm run dev --workspace=examples/queue-basic
```

## Running tests

```bash
# Unit tests only
npm run test:unit --workspace=__tests__

# Integration tests (requires Docker)
npm run test:integration --workspace=__tests__

# All tests
npm run test --workspace=__tests__
```

## Adding a new adapter

1. Create `adapters/{module}-{backend}/` following the structure of an existing adapter
2. Implement the adapter contract from `@pgshift/core`
3. Export a factory function as the only public API
4. Add an example under `examples/`
5. Open a pull request

## Adding a new module

1. Define the adapter contract in `packages/core/source/types.ts`
2. Add the module to `PgShiftConfig` and `PgShiftClient`
3. Create the public package under `packages/`
4. Implement at least one adapter under `adapters/`

## Code style

PgShift uses Biome for formatting and linting.

```bash
npm run format
```
