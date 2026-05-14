import { Pool } from 'pg'

export interface PoolConfig {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
}

export class PgPool {
  private readonly pool: Pool

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      connectionString: config.url,
      max: config.max ?? 10,
      ssl: config.ssl as { rejectUnauthorized: boolean } | undefined,
    })
  }

  async query<R extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<R[]> {
    const client = await this.pool.connect()
    try {
      const result = await client.query<R>(text, values)
      return result.rows
    } finally {
      client.release()
    }
  }

  async end(): Promise<void> {
    await this.pool.end()
  }
}
