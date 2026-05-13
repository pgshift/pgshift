import { MetricsCollector } from './metrics'
import type {
  CacheAdapter,
  CacheViewConfig,
  MigrationHint,
  PgShiftConfig,
  SearchAdapter,
  SearchIndexConfig,
  SearchQueryOptions,
  SearchResult,
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
  }
}

export class PgShiftClient {
  private readonly opts: PgShiftClientOptions
  private readonly metrics: MetricsCollector | undefined

  private _search = new Map<string, SearchHandle>()
  private _cache = new Map<string, CacheHandle>()
  private _searchAdapter: SearchAdapter | undefined
  private _cacheAdapter: CacheAdapter | undefined

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
  // cache(name) — returns a CacheHandle for the given view name
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

  // ---------------------------------------------------------------------------
  // Adapter resolution — lazy, falls back to Postgres default
  // ---------------------------------------------------------------------------

  private getSearchAdapter(): SearchAdapter {
    if (!this._searchAdapter) {
      const factory = this.opts.adapters?.search
      if (!factory) {
        throw new Error(
          '[PgShift] No search adapter configured. ' +
            'Pass adapters.search to createClient, or install @pgshift/search.',
        )
      }
      this._searchAdapter = factory()
    }

    return this._searchAdapter
  }

  private getCacheAdapter(): CacheAdapter {
    if (!this._cacheAdapter) {
      const factory = this.opts.adapters?.cache
      if (!factory) {
        throw new Error(
          '[PgShift] No cache adapter configured. ' +
            'Pass adapters.cache to createClient, or install @pgshift/cache.',
        )
      }
      this._cacheAdapter = factory()
    }

    return this._cacheAdapter
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  async destroy(): Promise<void> {
    await this._searchAdapter?.teardown?.()
    await this._cacheAdapter?.teardown?.()
  }
}

// ---------------------------------------------------------------------------
// SearchHandle — fluent API per entity
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
// CacheHandle — fluent API per view name
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
