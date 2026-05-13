import { createClient } from '@pgshift/queue'
import { Pool } from 'pg'

const DATABASE_URL = 'postgres://user:pass@localhost:5432/pgshift_test'

const db = createClient({ url: DATABASE_URL })
const pool = new Pool({ connectionString: DATABASE_URL })

await db.queue('risky-jobs').setup()

// Push a job with only 2 retries so it fails fast
await db
  .queue('risky-jobs')
  .push({ task: 'impossible-operation' }, { retries: 2 })

console.log('Job pushed. Starting worker — this handler always fails...\n')

await db.queue('risky-jobs').process(async (job) => {
  console.log(`Attempt ${job.attempts} — job ${job.id}`)
  throw new Error('This operation always fails')
})

// Wait for all retry attempts to exhaust
// Backoff: attempt 1 → 2s, attempt 2 → 4s
await new Promise((r) => setTimeout(r, 10_000))

await db.destroy()

// Inspect the dead letter — jobs with status = 'failed'
console.log('\nDead letter queue:')
const { rows } = await pool.query(`
  SELECT id, attempts, error, failed_at
  FROM _pgshift_queue_risky_jobs
  WHERE status = 'failed'
`)

for (const row of rows) {
  console.log(`  Job ${row.id}`)
  console.log(`    Attempts: ${row.attempts}`)
  console.log(`    Error: ${row.error}`)
  console.log(`    Failed at: ${row.failed_at}`)
}

await pool.end()
