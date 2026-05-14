import { createClient } from '@pgshift/vector'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

// ---------------------------------------------------------------------------
// Mock embedding function
// Generates a deterministic fake embedding based on the input string.
// Replace this with a real embedding provider (OpenAI, Cohere, etc.)
// ---------------------------------------------------------------------------

function mockEmbed(text: string, dimensions = 3): number[] {
  const seed = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return Array.from({ length: dimensions }, (_, i) => {
    const val = Math.sin(seed + i) * 0.5 + 0.5
    return Number(val.toFixed(6))
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const db = createClient({ url: DATABASE_URL })

// Create the vector index — dimensions must match your embedding model
await db.vector('articles').index({
  dimensions: 3, // use 1536 for OpenAI text-embedding-ada-002
  metric: 'cosine',
})

// ---------------------------------------------------------------------------
// Insert documents with their embeddings
// ---------------------------------------------------------------------------

const articles = [
  { id: '1', title: 'Getting started with PostgreSQL', category: 'database' },
  { id: '2', title: 'How to use pgvector for AI apps', category: 'ai' },
  {
    id: '3',
    title: 'Building a search engine with tsvector',
    category: 'database',
  },
  {
    id: '4',
    title: 'Vector databases compared: pgvector vs Pinecone',
    category: 'ai',
  },
  {
    id: '5',
    title: 'Introduction to Node.js and TypeScript',
    category: 'backend',
  },
]

for (const article of articles) {
  await db.vector('articles').upsert(article.id, {
    embedding: mockEmbed(article.title),
    data: { title: article.title, category: article.category },
  })
}

console.log(`Indexed ${articles.length} articles.\n`)

// ---------------------------------------------------------------------------
// Similarity search
// ---------------------------------------------------------------------------

const queryText = 'pgvector artificial intelligence'
const queryEmbedding = mockEmbed(queryText)

console.log(`--- similarity search: "${queryText}" ---`)
const results = await db.vector('articles').query({
  embedding: queryEmbedding,
  topK: 3,
})

results.forEach((r) => {
  const data = r.data as { title: string; category: string }
  console.log(`  [${r.score.toFixed(4)}] ${data.title} (${data.category})`)
})

// ---------------------------------------------------------------------------
// Hybrid search — vector similarity + relational filter
// The key advantage over Pinecone: single query, no cross-service join
// ---------------------------------------------------------------------------

console.log(
  '\n--- hybrid search: same query, filtered to category "database" ---',
)
const hybrid = await db.vector('articles').query({
  embedding: queryEmbedding,
  topK: 3,
  filters: { category: 'database' },
})

hybrid.forEach((r) => {
  const data = r.data as { title: string; category: string }
  console.log(`  [${r.score.toFixed(4)}] ${data.title} (${data.category})`)
})

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

await db.vector('articles').delete('1')
console.log('\nDeleted article 1.')

await db.destroy()
