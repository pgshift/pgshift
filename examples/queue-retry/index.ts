import { createClient } from '@pgshift/queue'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

await db.queue('flaky-jobs').setup()

// Push a job with up to 5 retry attempts
await db
  .queue('flaky-jobs')
  .push(
    { task: 'send-webhook', url: 'https://example.com/hook' },
    { retries: 5 },
  )

console.log('Job pushed. Starting worker...')

let attemptCount = 0

await db.queue('flaky-jobs').process(async (job) => {
  attemptCount++

  console.log(
    `Attempt ${attemptCount} — job ${job.id} (attempts so far: ${job.attempts})`,
  )

  // Simulate a flaky external service — fail the first 2 attempts
  if (attemptCount < 3) {
    console.log(`  Simulating failure on attempt ${attemptCount}...`)
    throw new Error('External service temporarily unavailable')
  }

  // Third attempt succeeds
  console.log(`  Success on attempt ${attemptCount}.`)
})

// Wait long enough for retries with backoff to complete
// Backoff: attempt 1 → 2s, attempt 2 → 4s
await new Promise((r) => setTimeout(r, 10_000))

await db.destroy()
console.log(`\nDone. Total attempts: ${attemptCount}`)
