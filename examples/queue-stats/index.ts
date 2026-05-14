import { createClient } from '@pgshift/queue'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

await db.queue('batch-jobs').setup()

// Push 10 jobs
for (let i = 1; i <= 10; i++) {
  await db.queue('batch-jobs').push({ index: i, task: `process-item-${i}` })
}

// Stats before processing
const before = await db.queue('batch-jobs').stats()
console.log('Before processing:')
console.table(before)

// Start processing with artificial delay to observe mid-flight stats
await db.queue('batch-jobs').process(async (job) => {
  await new Promise((r) => setTimeout(r, 300))
})

// Stats mid-processing
await new Promise((r) => setTimeout(r, 500))
const during = await db.queue('batch-jobs').stats()
console.log('\nDuring processing:')
console.table(during)

// Wait for all jobs to complete
await new Promise((r) => setTimeout(r, 5_000))

// Stats after processing
const after = await db.queue('batch-jobs').stats()
console.log('\nAfter processing:')
console.table(after)

await db.destroy()
