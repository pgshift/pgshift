import { Pool } from 'pg'
import { TEST_DATABASE_URL } from './global'

export function createPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL })
}

/**
 * Drops all _pgshift_ tables and materialized views created during a test.
 * Call in afterEach to ensure a clean state per test.
 */
export async function cleanDatabase(pool: Pool): Promise<void> {
  // Drop materialized views
  const views = await pool.query<{ matviewname: string }>(`
    SELECT matviewname FROM pg_matviews
    WHERE matviewname LIKE '_pgshift_%'
  `)
  for (const { matviewname } of views.rows) {
    await pool.query(`DROP MATERIALIZED VIEW IF EXISTS ${matviewname} CASCADE`)
  }

  // Drop tables
  const tables = await pool.query<{ tablename: string }>(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'current_schema()'
      AND tablename LIKE '_pgshift_%'
  `)
  for (const { tablename } of tables.rows) {
    await pool.query(`DROP TABLE IF EXISTS ${tablename} CASCADE`)
  }

  // Also clean config tables
  await pool.query(`DROP TABLE IF EXISTS _pgshift_search_config CASCADE`)
  await pool.query(`DROP TABLE IF EXISTS _pgshift_cache_config CASCADE`)
}
