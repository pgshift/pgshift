/**
 * PgShift — Types & Adapter Contracts
 * "Start with Postgres. Shift only when you must."
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Awaitable<T> = T | Promise<T>

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface PgShiftConfig {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
}

// ---------------------------------------------------------------------------
// Metrics & migration hints
// ---------------------------------------------------------------------------

export type PgShiftModule = 'search' | 'cache' | 'queue'

export type MetricUnit = 'ms' | 'count' | 'per_second' | 'bytes'

export interface MetricSnapshot {
  module: PgShiftModule
  adapter: string
  timestamp: Date
  value: number
  unit: MetricUnit
  meta?: Record<string, unknown>
}

export interface MigrationHint {
  module: PgShiftModule
  currentAdapter: string
  suggestedAdapter: string
  reason: string
  /** 0–1 urgency score */
  urgency: number
  learnMoreUrl?: string
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchWeight = 'A' | 'B' | 'C' | 'D'

export interface SearchIndexConfig {
  fields: string[]
  weights?: Record<string, SearchWeight>
  fuzzy?: boolean
  language?: string
}

export interface SearchQueryOptions {
  limit?: number
  offset?: number
  fuzzy?: boolean
  language?: string
  filters?: Record<string, unknown>
}

export interface SearchResult<T = Record<string, unknown>> {
  id: string
  rank: number
  data: T
}

export interface SearchAdapter {
  readonly name: string
  index(entity: string, config: SearchIndexConfig): Awaitable<void>
  upsert(
    entity: string,
    id: string,
    data: Record<string, unknown>,
  ): Awaitable<void>
  query<T = Record<string, unknown>>(
    entity: string,
    term: string,
    options?: SearchQueryOptions,
  ): Awaitable<SearchResult<T>[]>
  delete(entity: string, id: string): Awaitable<void>
  teardown?(): Awaitable<void>
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface CacheViewConfig {
  query: string
  refreshEvery?: number
}

export interface CacheAdapter {
  readonly name: string
  register(name: string, config: CacheViewConfig): Awaitable<void>
  get<T = unknown>(name: string): Awaitable<T[]>
  refresh(name: string): Awaitable<void>
  teardown?(): Awaitable<void>
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueJobOptions {
  delay?: number
  retries?: number
  backoff?: 'fixed' | 'exponential'
  priority?: number
  timeout?: number
}

export interface QueueJob<T = unknown> {
  id: string
  name: string
  payload: T
  status: string
  priority: number
  attempts: number
  maxRetries: number
  runAt: Date
  createdAt: Date
}

export interface QueueStats {
  pending: number
  processing: number
  done: number
  failed: number
}

export interface QueueAdapter {
  readonly name: string
  ensureQueue(queue: string, options?: QueueJobOptions): Awaitable<void>
  push<T = unknown>(
    queue: string,
    payload: T,
    options?: QueueJobOptions,
  ): Awaitable<string>
  process<T = unknown>(
    queue: string,
    handler: (job: QueueJob<T>) => Awaitable<void>,
  ): Awaitable<void>
  cancel(queue: string, jobId: string): Awaitable<void>
  stats(queue: string): Awaitable<QueueStats>
  teardown?(): Awaitable<void>
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export interface CronJobOptions {
  /** Target queue name. Defaults to the queue configured in createClient. */
  queue?: string
  /** Payload inserted into the queue when the job fires. */
  payload?: Record<string, unknown>
}

export interface CronJobInfo {
  name: string
  schedule: string
  active: boolean
  jobId: number
}

export interface CronAdapter {
  readonly name: string
  setup(): Awaitable<void>
  schedule(
    jobName: string,
    cronExpr: string,
    options: CronJobOptions,
  ): Awaitable<void>
  unschedule(jobName: string): Awaitable<void>
  list(): Awaitable<CronJobInfo[]>
  teardown?(): Awaitable<void>
}
