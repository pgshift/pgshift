import { createClient, normalizers } from '@pgshift/state'
import { Pool } from 'pg'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const pool = new Pool({ connectionString: DATABASE_URL })

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    email TEXT NOT NULL,
    name  TEXT NOT NULL,
    phone TEXT
  )
`)

const db = createClient({ url: DATABASE_URL })

// Install normalization triggers enforced at the database level
// Scripts, migrations, admins all writes go through the same rules
await db.state('users').normalize({
  email: normalizers.email, // LOWER(TRIM(value))
  name: normalizers.name, // TRIM + collapse spaces
  phone: normalizers.phone, // remove non-digits
})

// Insert with messy data
await pool.query(`INSERT INTO users (email, name, phone) VALUES ($1, $2, $3)`, [
  '  USER@EXAMPLE.COM  ',
  '  John   Doe  ',
  '(11) 99999-8888',
])

const { rows } = await pool.query(
  `SELECT email, name, phone FROM users LIMIT 1`,
)
const user = rows[0] as { email: string; name: string; phone: string }

console.log('Stored values after normalization:')
console.log(`  email: ${user.email}`) // user@example.com
console.log(`  name:  ${user.name}`) // John Doe
console.log(`  phone: ${user.phone}`) // 11999998888

// Even direct SQL bypasses go through the trigger
await pool.query(
  `UPDATE users SET email = $1 WHERE email = 'user@example.com'`,
  ['  ADMIN@EXAMPLE.COM  '],
)

const { rows: updated } = await pool.query(`SELECT email FROM users LIMIT 1`)
console.log(
  `\nAfter direct SQL update: ${(updated[0] as { email: string }).email}`,
)
// admin@example.com normalized even from raw SQL

await db.destroy()
await pool.end()
