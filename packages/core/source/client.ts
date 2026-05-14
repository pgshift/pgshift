import { MetricsCollector } from './metrics'
import type {
  CacheAdapter,
  CacheViewConfig,
  CronAdapter,
  CronJobInfo,
  CronJobOptions,
  MigrationHint,
  PgShiftConfig,
  QueueAdapter,
  QueueJob,
  QueueJobOptions,
  QueueStats,
  SearchAdapter,
  SearchIndexConfig,
  SearchQueryOptions,
  SearchResult,
  VectorAdapter,
  VectorIndexConfig,
  VectorQueryOptions,
  VectorResult,
  VectorUpsertData,
} from './types'

// ---------------------------------------------------------------------------
// PgShiftClient
// ---------------------------------------------------------------------------

export interface PgShiftClientOptions {
  config: PgShiftConfig
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
  adapters?: {
    search?: () => SearchAdapter
    cache?: () => CacheAdapter
    queue?: () => QueueAdapter
    vector?: () => VectorAdapter
    cron?: () => CronAdapter
  }
}

export class PgShiftClient {
  private readonly opts: PgShiftClientOptions
  private readonly metrics: MetricsCollector | undefined

  private _search = new Map<string, SearchHandle>()
  private _cache = new Map<string, CacheHandle>()
  private _queue = new Map<string, QueueHandle>()
  private _vector = new Map<string, VectorHandle>()

  private _searchAdapter: SearchAdapter | undefined
  private _cacheAdapter: CacheAdapter | undefined
  private _queueAdapter: QueueAdapter | undefined
  private _vectorAdapter: VectorAdapter | undefined
  private _cronAdapter: CronAdapter | undefined

  constructor(opts: PgShiftClientOptions) {
    this.opts = opts
    if (opts.metrics !== false) {
      this.metrics = new MetricsCollector(opts.onMigrationHint)
    }
  }

  // ---------------------------------------------------------------------------
  // search(entity) — returns a SearchHandle for the given entity
  // ---------------------------------------------------------------------------
  search(entity: string): SearchHandle {
    if (!this._search.has(entity)) {
      this._search.set(
        entity,
        new SearchHandle(entity, this.getSearchAdapter(), this.metrics),
      )
    }
    return this._search.get(entity)!
  }

  // ---------------------------------------------------------------------------
  // queue(name) — returns a QueueHandle for the given queue name
  // ---------------------------------------------------------------------------

  cache(name: string): CacheHandle {
    if (!this._cache.has(name)) {
      this._cache.set(
        name,
        new CacheHandle(name, this.getCacheAdapter(), this.metrics),
      )
    }
    return this._cache.get(name)!
  }

  queue(name: string): QueueHandle {
    if (!this._queue.has(name)) {
      this._queue.set(
        name,
        new QueueHandle(name, this.getQueueAdapter(), this.metrics),
      )
    }
    return this._queue.get(name)!
  }

  vector(entity: string): VectorHandle {
    if (!this._vector.has(entity)) {
      this._vector.set(
        entity,
        new VectorHandle(entity, this.getVectorAdapter()),
      )
    }
    return this._vector.get(entity)!
  }

  get cron(): CronNamespace {
    return new CronNamespace(this.getCronAdapter())
  }

  private getSearchAdapter(): SearchAdapter {
    if (!this._searchAdapter) {
      const factory = this.opts.adapters?.search
      if (!factory)
        throw new Error(
          '[PgShift] No search adapter configured. Install @pgshift/search.',
        )
      this._searchAdapter = factory()
    }
    return this._searchAdapter
  }

  private getCacheAdapter(): CacheAdapter {
    if (!this._cacheAdapter) {
      const factory = this.opts.adapters?.cache
      if (!factory)
        throw new Error(
          '[PgShift] No cache adapter configured. Install @pgshift/cache.',
        )
      this._cacheAdapter = factory()
    }
    return this._cacheAdapter
  }

  private getQueueAdapter(): QueueAdapter {
    if (!this._queueAdapter) {
      const factory = this.opts.adapters?.queue
      if (!factory)
        throw new Error(
          '[PgShift] No queue adapter configured. Install @pgshift/queue.',
        )
      this._queueAdapter = factory()
    }
    return this._queueAdapter
  }

  private getVectorAdapter(): VectorAdapter {
    if (!this._vectorAdapter) {
      const factory = this.opts.adapters?.vector
      if (!factory)
        throw new Error(
          '[PgShift] No vector adapter configured. Install @pgshift/vector.',
        )
      this._vectorAdapter = factory()
    }
    return this._vectorAdapter
  }

  private getCronAdapter(): CronAdapter {
    if (!this._cronAdapter) {
      const factory = this.opts.adapters?.cron
      if (!factory)
        throw new Error(
          '[PgShift] No cron adapter configured. Install @pgshift/cron.',
        )
      this._cronAdapter = factory()
    }
    return this._cronAdapter
  }

  async destroy(): Promise<void> {
    await this._searchAdapter?.teardown?.()
    await this._cacheAdapter?.teardown?.()
    await this._queueAdapter?.teardown?.()
    await this._vectorAdapter?.teardown?.()
    await this._cronAdapter?.teardown?.()
  }
}

// ---------------------------------------------------------------------------
// SearchHandle
// ---------------------------------------------------------------------------

class SearchHandle {
  constructor(
    private readonly entity: string,
    private readonly adapter: SearchAdapter,
    private readonly metrics: MetricsCollector | undefined,
  ) {}

  async index(config: SearchIndexConfig): Promise<void> {
    return this.adapter.index(this.entity, config)
  }

  async upsert(id: string, data: Record<string, unknown>): Promise<void> {
    return this.adapter.upsert(this.entity, id, data)
  }

  async query<T = Record<string, unknown>>(
    term: string,
    options?: SearchQueryOptions,
  ): Promise<SearchResult<T>[]> {
    const start = Date.now()
    const results = await this.adapter.query<T>(this.entity, term, options)
    this.metrics?.record({
      module: 'search',
      adapter: this.adapter.name,
      timestamp: new Date(),
      value: Date.now() - start,
      unit: 'ms',
      meta: { entity: this.entity, term },
    })
    return results
  }

  async delete(id: string): Promise<void> {
    return this.adapter.delete(this.entity, id)
  }
}

// ---------------------------------------------------------------------------
// CacheHandle
// ---------------------------------------------------------------------------

class CacheHandle {
  constructor(
    private readonly name: string,
    private readonly adapter: CacheAdapter,
    private readonly metrics: MetricsCollector | undefined,
  ) {}

  async register(config: CacheViewConfig): Promise<void> {
    return this.adapter.register(this.name, config)
  }

  async get<T = unknown>(): Promise<T[]> {
    const start = Date.now()
    const rows = await this.adapter.get<T>(this.name)

    this.metrics?.record({
      module: 'cache',
      adapter: this.adapter.name,
      timestamp: new Date(),
      value: Date.now() - start,
      unit: 'ms',
      meta: { name: this.name },
    })

    return rows
  }

  async refresh(): Promise<void> {
    return this.adapter.refresh(this.name)
  }
}

// ---------------------------------------------------------------------------
// QueueHandle
// ---------------------------------------------------------------------------

class QueueHandle {
  constructor(
    private readonly name: string,
    private readonly adapter: QueueAdapter,
    private readonly metrics: MetricsCollector | undefined,
  ) {}

  async setup(options?: QueueJobOptions): Promise<void> {
    return this.adapter.ensureQueue(this.name, options)
  }

  async push<T = unknown>(
    payload: T,
    options?: QueueJobOptions,
  ): Promise<string> {
    return this.adapter.push<T>(this.name, payload, options)
  }

  async process<T = unknown>(
    handler: (job: QueueJob<T>) => Promise<void>,
  ): Promise<void> {
    return this.adapter.process<T>(this.name, handler)
  }

  async cancel(jobId: string): Promise<void> {
    return this.adapter.cancel(this.name, jobId)
  }

  async stats(): Promise<QueueStats> {
    return this.adapter.stats(this.name)
  }
}

// ---------------------------------------------------------------------------
// VectorHandle
// ---------------------------------------------------------------------------

class VectorHandle {
  constructor(
    private readonly entity: string,
    private readonly adapter: VectorAdapter,
  ) {}

  async index(config: VectorIndexConfig): Promise<void> {
    return this.adapter.index(this.entity, config)
  }

  async upsert(id: string, data: VectorUpsertData): Promise<void> {
    return this.adapter.upsert(this.entity, id, data)
  }

  async query<T = Record<string, unknown>>(
    options: VectorQueryOptions,
  ): Promise<VectorResult<T>[]> {
    return this.adapter.query<T>(this.entity, options)
  }

  async delete(id: string): Promise<void> {
    return this.adapter.delete(this.entity, id)
  }
}

// ---------------------------------------------------------------------------
// CronNamespace
// ---------------------------------------------------------------------------

class CronNamespace {
  constructor(private readonly adapter: CronAdapter) {}

  async setup(): Promise<void> {
    return this.adapter.setup()
  }

  async list(): Promise<CronJobInfo[]> {
    return this.adapter.list()
  }

  call(name: string): CronHandle {
    return new CronHandle(name, this.adapter)
  }
}

// ---------------------------------------------------------------------------
// CronHandle
// ---------------------------------------------------------------------------

class CronHandle {
  constructor(
    private readonly name: string,
    private readonly adapter: CronAdapter,
  ) {}

  async schedule(cronExpr: string, options: CronJobOptions): Promise<void> {
    return this.adapter.schedule(this.name, cronExpr, options)
  }

  async unschedule(): Promise<void> {
    return this.adapter.unschedule(this.name)
  }
}
