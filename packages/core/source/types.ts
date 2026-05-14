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

export type PgShiftModule =
  | 'search'
  | 'cache'
  | 'queue'
  | 'cron'
  | 'vector'
  | 'state'
  | 'workflow'

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
  /** 0-1 urgency score */
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

export type QueueJobStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface QueueJobOptions {
  delay?: number
  retries?: number
  backoff?: 'fixed' | 'exponential'
  priority?: number
  timeout?: number
}

export interface QueueJob<T = unknown> {
  id: string
  payload: T
  status: QueueJobStatus
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
  queue?: string
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

// ---------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------

export type VectorMetric = 'cosine' | 'euclidean' | 'dotproduct'

export interface VectorIndexConfig {
  dimensions: number
  metric?: VectorMetric
}

export interface VectorUpsertData {
  embedding: number[]
  data?: Record<string, unknown>
}

export interface VectorQueryOptions {
  embedding: number[]
  topK?: number
  minScore?: number
  filters?: Record<string, unknown>
}

export interface VectorResult<T = Record<string, unknown>> {
  id: string
  score: number
  data: T
}

export interface VectorAdapter {
  readonly name: string
  index(entity: string, config: VectorIndexConfig): Awaitable<void>
  upsert(entity: string, id: string, data: VectorUpsertData): Awaitable<void>
  query<T = Record<string, unknown>>(
    entity: string,
    options: VectorQueryOptions,
  ): Awaitable<VectorResult<T>[]>
  delete(entity: string, id: string): Awaitable<void>
  teardown?(): Awaitable<void>
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface StateDefinition {
  field: string
  states: string[]
  transitions: Record<string, string[]>
  initial?: string
}

export type StateNormalizeConfig = Record<string, string>

export interface StateAuditConfig {
  track?: string[]
}

export interface StateConsensusConfig {
  transition: string
  require: number
  roles?: string[]
  when?: string
}

export interface StateApprovalOptions {
  by: string
  role?: string
}

export interface StateHistoryEntry {
  id: string
  entityId: string
  field: string
  fromValue: string | null
  toValue: string
  changedBy: string | null
  changedAt: Date
}

export interface StatePendingApproval {
  id: string
  entityId: string
  transition: string
  approvedBy: string
  role: string | null
  approvedAt: Date
}

export interface StateAdapter {
  readonly name: string
  define(table: string, config: StateDefinition): Awaitable<void>
  normalize(table: string, config: StateNormalizeConfig): Awaitable<void>
  audit(table: string, config?: StateAuditConfig): Awaitable<void>
  consensus(table: string, config: StateConsensusConfig): Awaitable<void>
  approve(
    table: string,
    entityId: string,
    options: StateApprovalOptions,
  ): Awaitable<void>
  history(table: string, entityId: string): Awaitable<StateHistoryEntry[]>
  pendingApprovals(
    table: string,
    entityId: string,
  ): Awaitable<StatePendingApproval[]>
  teardown?(): Awaitable<void>
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export interface WorkflowStepDefinition {
  handler: string
  retries?: number
  compensate?: string
}

export interface WorkflowDefinition {
  steps: Record<string, WorkflowStepDefinition>
  dag: Record<string, string[]>
}

export interface WorkflowStepStatus {
  status: string
  attempts: number
  output?: Record<string, unknown>
  error?: string
  startedAt?: Date
  completedAt?: Date
}

export interface WorkflowRunStatus {
  runId: string
  workflow: string
  status: string
  input: Record<string, unknown>
  startedAt: Date
  finishedAt?: Date
  steps: Record<string, WorkflowStepStatus>
}

export interface WorkflowAdapter {
  readonly name: string
  define(name: string, definition: WorkflowDefinition): Awaitable<void>
  handlers(
    name: string,
    handlers: Record<string, (ctx: unknown) => Promise<unknown>>,
  ): Awaitable<void>
  run(name: string, input?: Record<string, unknown>): Awaitable<string>
  status(runId: string): Awaitable<WorkflowRunStatus>
  work(name: string): Awaitable<void>
  teardown?(): Awaitable<void>
}
