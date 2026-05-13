import { createClient as createCronClient, schedule } from '@pgshift/cron'
import { createClient as createQueueClient } from '@pgshift/queue'

const DATABASE_URL = 'postgres://user:pass@localhost:5433/pgshift_test'

// ---------------------------------------------------------------------------
// Cron client — schedules jobs into the queue
// ---------------------------------------------------------------------------

const cron = createCronClient({
  url: DATABASE_URL,
  queue: 'tasks', // default queue for all cron jobs
})

// Ensure pg_cron extension is installed
await cron.cron.setup()

// Setup the queue table
const queue = createQueueClient({ url: DATABASE_URL })
await queue.queue('tasks').setup()

// ---------------------------------------------------------------------------
// Schedule jobs
// ---------------------------------------------------------------------------

// Runs every day at midnight
await cron.cron('cleanup-sessions').schedule(schedule.daily({ hour: 0 }), {
  payload: { type: 'cleanup-sessions' },
})

// Runs every Monday at 8am
await cron
  .cron('weekly-digest')
  .schedule(schedule.weekly({ day: 'monday', hour: 8 }), {
    payload: { type: 'weekly-digest' },
  })

// Runs every 1 minutes
await cron.cron('heartbeat').schedule(schedule.every({ minutes: 1 }), {
  payload: { type: 'heartbeat' },
})

// Runs on the 1st of every month at 9am
await cron
  .cron('monthly-report')
  .schedule(schedule.monthly({ day: 1, hour: 9 }), {
    queue: 'reports', // override default queue for this job
    payload: { type: 'monthly-report' },
  })

// ---------------------------------------------------------------------------
// List scheduled jobs
// ---------------------------------------------------------------------------

const jobs = await cron.cron.list()
console.log('Scheduled cron jobs:')
console.table(jobs)

// ---------------------------------------------------------------------------
// Worker — processes jobs when they fire
// ---------------------------------------------------------------------------

await queue.queue('tasks').process(async (job) => {
  const { type } = job.payload as { type: string }

  switch (type) {
    case 'cleanup-sessions':
      console.log('Running cleanup-sessions...')
      // await cleanupExpiredSessions()
      break

    case 'weekly-digest':
      console.log('Sending weekly digest...')
      // await sendWeeklyDigest()
      break

    case 'heartbeat':
      console.log('Heartbeat.')
      break

    default:
      console.log(`Unknown job type: ${type}`)
  }
})

console.log('Worker started. Waiting for cron jobs to fire...')

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

process.on('SIGTERM', async () => {
  await cron.destroy()
  await queue.destroy()
  process.exit(0)
})
