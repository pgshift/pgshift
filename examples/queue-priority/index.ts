import { createClient } from '@pgshift/queue'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

await db.queue('notifications').setup()

// Push jobs with different priorities — higher number = processed first
await db
  .queue('notifications')
  .push({ message: 'Low priority task' }, { priority: 0 })
await db
  .queue('notifications')
  .push({ message: 'High priority task' }, { priority: 10 })
await db
  .queue('notifications')
  .push({ message: 'Medium priority task' }, { priority: 5 })
await db
  .queue('notifications')
  .push({ message: 'Critical task' }, { priority: 100 })

console.log('4 jobs pushed. Starting worker...\n')
console.log('Expected order: Critical → High → Medium → Low\n')

const processed: string[] = []

await db.queue('notifications').process(async (job) => {
  const { message } = job.payload as { message: string }
  processed.push(message)
  console.log(`  [priority ${job.priority}] ${message}`)
})

// Wait for all jobs to be processed
await new Promise((r) => setTimeout(r, 2_000))

await db.destroy()

console.log('\nProcessed order:')
processed.forEach((m, i) => console.log(`  ${i + 1}. ${m}`))
