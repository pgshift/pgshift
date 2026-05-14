import { createClient } from '@pgshift/queue'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

await db.queue('scheduled-jobs').setup()

const DELAY_MS = 5_000

console.log(`Pushing job with a ${DELAY_MS / 1000}s delay...`)

await db
  .queue('scheduled-jobs')
  .push({ task: 'send-reminder', userId: 'user_123' }, { delay: DELAY_MS })

const pushedAt = Date.now()
console.log(`Job pushed at ${new Date().toISOString()}`)
console.log(
  `Expected to run after ${new Date(pushedAt + DELAY_MS).toISOString()}\n`,
)

await db.queue('scheduled-jobs').process(async (job) => {
  const elapsed = Date.now() - pushedAt
  const { task, userId } = job.payload as { task: string; userId: string }

  console.log(`Job processed at ${new Date().toISOString()}`)
  console.log(`  Task: ${task}`)
  console.log(`  User: ${userId}`)
  console.log(`  Elapsed since push: ${(elapsed / 1000).toFixed(1)}s`)
})

// Wait long enough for the delay + processing
await new Promise((r) => setTimeout(r, DELAY_MS + 2_000))

await db.destroy()
