import { createClient } from '@pgshift/search'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

await db.search('products').index({
  fields: ['name', 'description', 'category'],
  weights: { name: 'A', description: 'B', category: 'C' },
  fuzzy: true,
})

await db.search('products').upsert('1', {
  name: 'Nike Air Max 90',
  description: 'Classic sneaker with visible Air unit.',
  category: 'shoes',
})

const results = await db.search('products').query('air max', {
  fuzzy: true,
  filters: { category: 'shoes' },
  limit: 10,
})

console.log(results)

await db.destroy()
