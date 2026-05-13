import { Pool } from 'pg'

const DATABASE_URL = 'postgres://user:pass@localhost:5432/pgshift_test'
const pool = new Pool({ connectionString: DATABASE_URL })

await pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id       SERIAL PRIMARY KEY,
    name     TEXT NOT NULL,
    category TEXT NOT NULL
  )
`)

await pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    id         SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    amount     NUMERIC NOT NULL
  )
`)

const { rowCount } = await pool.query('SELECT 1 FROM products LIMIT 1')
if (!rowCount || rowCount === 0) {
  await pool.query(`
    INSERT INTO products (name, category) VALUES
      ('Widget A', 'Widgets'),
      ('Widget B', 'Widgets'),
      ('Gadget X', 'Gadgets'),
      ('Gadget Y', 'Gadgets'),
      ('Doohickey Z', 'Misc')
  `)

  await pool.query(`
    INSERT INTO orders (product_id, amount) VALUES
      (1, 49.99), (1, 49.99), (1, 49.99),
      (2, 29.99), (2, 29.99),
      (3, 99.99), (3, 99.99), (3, 99.99), (3, 99.99),
      (4, 59.99),
      (5, 9.99)
  `)

  console.log('Seed complete.')
} else {
  console.log('Already seeded, skipping.')
}

await pool.end()
