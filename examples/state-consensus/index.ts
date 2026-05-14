import { createClient } from '@pgshift/state'
import { Pool } from 'pg'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const pool = new Pool({ connectionString: DATABASE_URL })

await pool.query(`
  CREATE TABLE IF NOT EXISTS loans (
    id     TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    amount NUMERIC NOT NULL,
    status TEXT    NOT NULL DEFAULT 'pending'
  )
`)

const db = createClient({ url: DATABASE_URL })

// State machine
await db.state('loans').define({
  field: 'status',
  states: ['pending', 'approved', 'rejected', 'paid'],
  transitions: {
    pending: ['approved', 'rejected'],
    approved: ['paid'],
    rejected: [],
    paid: [],
  },
})

// Consensus: only loans over 10M require 2 approvals
// Small loans transition freely without consensus
await db.state('loans').consensus({
  transition: 'approved',
  require: 2,
  roles: ['finance', 'manager'],
  when: 'NEW.amount > 10000000',
})

// ---------------------------------------------------------------------------
// Small loan: no consensus required
// ---------------------------------------------------------------------------

const { rows: small } = await pool.query(
  `INSERT INTO loans (amount) VALUES (50000) RETURNING id`,
)
const smallLoan = (small[0] as { id: string }).id

await pool.query(`UPDATE loans SET status = 'approved' WHERE id = $1`, [
  smallLoan,
])
console.log('Small loan approved without consensus.')

// ---------------------------------------------------------------------------
// Large loan: 2 approvals required
// ---------------------------------------------------------------------------

const { rows: large } = await pool.query(
  `INSERT INTO loans (amount) VALUES (15000000) RETURNING id`,
)
const largeLoan = (large[0] as { id: string }).id

// Try to approve without any approvals — blocked
try {
  await pool.query(`UPDATE loans SET status = 'approved' WHERE id = $1`, [
    largeLoan,
  ])
} catch (err) {
  console.log(`\nBlocked (0 approvals): ${(err as Error).message}`)
}

// First approval
await db.state('loans').approve(largeLoan, { by: 'alice', role: 'finance' })
console.log('\nFinance approved.')

// Still blocked — need 2
try {
  await pool.query(`UPDATE loans SET status = 'approved' WHERE id = $1`, [
    largeLoan,
  ])
} catch (err) {
  console.log(`Blocked (1 approval): ${(err as Error).message}`)
}

// Second approval
await db.state('loans').approve(largeLoan, { by: 'bob', role: 'manager' })
console.log('Manager approved.')

// Now it goes through
await pool.query(`UPDATE loans SET status = 'approved' WHERE id = $1`, [
  largeLoan,
])
console.log('Large loan approved after 2 approvals.')

// Check pending approvals
const pending = await db.state('loans').pendingApprovals(largeLoan)
console.log(`\nApprovals recorded: ${pending.length}`)
pending.forEach((p) =>
  console.log(`  ${p.approvedBy} (${p.role}) at ${p.approvedAt.toISOString()}`),
)

await db.destroy()
await pool.end()
