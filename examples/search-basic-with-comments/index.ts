import { createClient } from '@pgshift/search'

// Create a connection to PostgreSQL
const db = createClient({
  url: 'postgres://user:pass@localhost:5432/pgshift_test',
})

// ─────────────────────────────────────────────────────────────
// Create (or sync) the search index for the "products" entity.
//
// This operation is idempotent:
// - Creates the internal shadow table if it does not exist
// - Creates indexes automatically
// - Safe to run multiple times
// ─────────────────────────────────────────────────────────────
await db.search('products').index({
  // Fields included in the full-text search index
  fields: ['name', 'description', 'category'],

  // PostgreSQL text-search ranking weights
  // Weight scale: A (highest) → B → C → D (lowest)
  weights: {
    name: 'A',
    description: 'B',
    category: 'C',
  },

  // Enable typo-tolerant matching
  // Example: "maxx" → "max"
  fuzzy: true,
})

// ─────────────────────────────────────────────────────────────
// Insert or update a searchable document
// ─────────────────────────────────────────────────────────────
await db.search('products').upsert('1', {
  name: 'Nike Air Max 90',
  description: 'Classic sneaker with visible Air unit.',
  category: 'shoes',
})

// ─────────────────────────────────────────────────────────────
// Run a search query
// ─────────────────────────────────────────────────────────────
const results = await db.search('products').query('maxx shoes 90 nike', {
  // Enable fuzzy matching for the query
  fuzzy: true,

  // Optional structured filters
  filters: {
    category: 'shoes',
  },

  // Maximum number of results returned
  limit: 10,
})

console.log(results)

// Gracefully close all database connections
await db.destroy()
