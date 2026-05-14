import { createClient } from '@pgshift/state'
import { Pool } from 'pg'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const pool = new Pool({ connectionString: DATABASE_URL })

// Create the loans table
await pool.query(`
  CREATE TABLE IF NOT EXISTS loans (
    id     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  )
`)

const db = createClient({ url: DATABASE_URL })

// Install state machine enforced at the database level
// No matter who writes to the table, invalid transitions are rejected
await db.state('loans').define({
  field: 'status',
  states: ['pending', 'approved', 'rejected', 'paid'],
  transitions: {
    pending: ['approved', 'rejected'],
    approved: ['paid'],
    rejected: [],
    paid: [],
  },
  initial: 'pending',
})

// Install audit log to track status changes
await db.state('loans').audit({ track: ['status', 'amount'] })

// Insert a loan
const { rows } = await pool.query(
  `INSERT INTO loans (amount) VALUES (50000) RETURNING id, status`,
)
const loan = rows[0] as { id: string; status: string }
console.log(`Loan created: ${loan.id} — status: ${loan.status}`)

// Valid transition: pending → approved
await pool.query(`UPDATE loans SET status = 'approved' WHERE id = $1`, [
  loan.id,
])
console.log('Loan approved.')

// Valid transition: approved → paid
await pool.query(`UPDATE loans SET status = 'paid' WHERE id = $1`, [loan.id])
console.log('Loan paid.')

// Invalid transition — this will throw
try {
  await pool.query(`UPDATE loans SET status = 'pending' WHERE id = $1`, [
    loan.id,
  ])
} catch (err) {
  console.log(`Blocked: ${(err as Error).message}`)
}

// Audit history
const history = await db.state('loans').history(loan.id)
console.log('\nAudit history:')
history.forEach((h) => {
  console.log(
    `  ${h.field}: ${h.fromValue ?? 'null'} → ${h.toValue} at ${h.changedAt.toISOString()}`,
  )
})

await db.destroy()
await pool.end()
