import { createClient } from '@pgshift/search'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

await db.search('products').index({
  fields: ['name', 'description', 'category'],
  weights: { name: 'A', description: 'B', category: 'C' },
  fuzzy: true,
})

const products = [
  {
    id: '1',
    name: 'Nike Air Max 90',
    description: 'Classic sneaker with visible Air unit.',
    category: 'shoes',
  },
  {
    id: '2',
    name: 'Adidas Ultraboost',
    description: 'High performance running shoe.',
    category: 'shoes',
  },
  {
    id: '3',
    name: 'Nike Air Force 1',
    description: 'Iconic low-top sneaker.',
    category: 'shoes',
  },
  {
    id: '4',
    name: 'MacBook Pro',
    description: 'Apple laptop with M3 chip.',
    category: 'electronics',
  },
  {
    id: '5',
    name: 'Sony WH-1000XM5',
    description: 'Noise cancelling wireless headphones.',
    category: 'electronics',
  },
]

for (const product of products) {
  await db.search('products').upsert(product.id, product)
}

console.log('Should return Nike Air Max 90 ranked first')
const r1 = await db.search('products').query('air max', { limit: 10 })
console.log(r1)

console.log('\n\nShould return Nike Air Max 90 and Nike Air Force 1')
const r2 = await db.search('products').query('sneaker', { limit: 10 })
console.log(r2)

console.log('\n\nShould return only electronics filtered by category')
const r3 = await db.search('products').query('laptop headphones', {
  filters: { category: 'electronics' },
  limit: 10,
})
console.log(r3)

console.log('\n\nShould return only Nike Air Force 1 after deleting Air Max 90')
await db.search('products').delete('1')
const r4 = await db.search('products').query('air max', { limit: 10 })
console.log(r4)

await db.destroy()
