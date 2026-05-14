import { createClient } from '@pgshift/queue'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

// Create the queue table — idempotent, safe to call on every startup
await db.queue('emails').setup()

// Push a job into the queue
const jobId = await db.queue('emails').push({
  to: 'user@example.com',
  subject: 'Welcome to PgShift',
  body: 'Start with Postgres. Shift only when you must.',
})

console.log(`Job enqueued: ${jobId}`)

// Start processing — handler runs for each job
await db.queue('emails').process(async (job) => {
  console.log(`Processing job ${job.id}`)
  console.log(`  Sending email to: ${(job.payload as { to: string }).to}`)

  // Simulate async work
  await new Promise((r) => setTimeout(r, 2000))

  console.log(`  Done.`)
})

// Let the worker process the job
await new Promise((r) => setTimeout(r, 500))

// Gracefully shut down — waits for in-flight jobs to complete
await db.destroy()
console.log('Worker stopped.')
