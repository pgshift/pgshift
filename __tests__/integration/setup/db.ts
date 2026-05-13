import { Pool } from 'pg'
import { TEST_DATABASE_URL } from './global'

export function createPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL })
}

/**
 * Creates a unique schema for a single test and returns its name.
 * Each test gets a completely isolated namespace in the database.
 */
export async function createSchema(pool: Pool): Promise<string> {
  const schema = `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  await pool.query(`CREATE SCHEMA ${schema}`)
  return schema
}

/**
 * Drops the test schema and everything inside it.
 */
export async function dropSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
}

/**
 * Returns a DATABASE_URL with search_path set to the given schema.
 * PgShift adapters will create all tables inside this schema.
 */
export function schemaUrl(schema: string): string {
  const url = new URL(TEST_DATABASE_URL)
  url.searchParams.set('options', `-c search_path=${schema}`)
  return url.toString()
}
