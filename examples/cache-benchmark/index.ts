import { createClient } from '@pgshift/cache'
import { Pool } from 'pg'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const ITERATIONS = 50

const QUERY = `
  SELECT
    p.id,
    p.name,
    p.category,
    COUNT(o.id)   AS order_count,
    SUM(o.amount) AS total_revenue
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.id
  GROUP BY p.id, p.name, p.category
  ORDER BY total_revenue DESC NULLS LAST
  LIMIT 10
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stats(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b)

  const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!
  const p99 = sorted[Math.ceil(0.99 * sorted.length) - 1]!

  return {
    avg: Number(avg.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    min: Number(sorted[0]!.toFixed(2)),
    max: Number(sorted[sorted.length - 1]!.toFixed(2)),
  }
}

function printTable(label: string, latencies: number[]) {
  const s = stats(latencies)

  console.log(`\n${label}`)

  console.table([
    {
      iterations: latencies.length,
      avg_ms: s.avg,
      p95_ms: s.p95,
      p99_ms: s.p99,
      min_ms: s.min,
      max_ms: s.max,
    },
  ])
}

// ---------------------------------------------------------------------------
// Direct query benchmark
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: DATABASE_URL,
})

const directLatencies: number[] = []

for (let i = 0; i < ITERATIONS; i++) {
  const start = performance.now()

  await pool.query(QUERY)

  directLatencies.push(performance.now() - start)
}

await pool.end()

printTable(`Direct query benchmark`, directLatencies)

// ---------------------------------------------------------------------------
// Cache benchmark
// ---------------------------------------------------------------------------

const db = createClient({
  url: DATABASE_URL,
})

await db.cache('benchmark_top_products').register({
  query: `
    SELECT
      p.id            AS _pgshift_id,
      p.name,
      p.category,
      COUNT(o.id)     AS order_count,
      SUM(o.amount)   AS total_revenue
    FROM products p
    LEFT JOIN orders o ON o.product_id = p.id
    GROUP BY p.id, p.name, p.category
    ORDER BY total_revenue DESC NULLS LAST
    LIMIT 10
  `,
  refreshEvery: 300,
})

const cacheLatencies: number[] = []

for (let i = 0; i < ITERATIONS; i++) {
  const start = performance.now()

  await db.cache('benchmark_top_products').get()

  cacheLatencies.push(performance.now() - start)
}

printTable(`Materialized view cache benchmark`, cacheLatencies)

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

const direct = stats(directLatencies)
const cache = stats(cacheLatencies)

const speedup = Number((direct.avg / cache.avg).toFixed(1))

console.log('\nPerformance comparison')

console.table([
  {
    metric: 'Average latency',
    direct_query_ms: direct.avg,
    cache_ms: cache.avg,
    speedup: `${speedup}x`,
  },
])

await db.destroy()
