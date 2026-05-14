import { createClient } from '@pgshift/cache'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

// Register a materialized view.
// The query runs once and the result is stored on disk.
// Subsequent reads are instant — no aggregation at query time.
//
// Alias a unique column as _pgshift_id to enable
// REFRESH CONCURRENTLY (non-blocking updates).
await db.cache('top_products').register({
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
  refreshEvery: 60,
})

console.log('\n\n--- top_products ---')
console.table(await db.cache('top_products').get())

// Manually trigger a blocking refresh when you need current data immediately
await db.cache('top_products').refresh()

console.log('\n--- top_products after manual refresh ---')
console.table(await db.cache('top_products').get())

await db.destroy()
