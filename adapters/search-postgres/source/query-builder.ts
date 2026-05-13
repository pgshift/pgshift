import type { SearchIndexConfig, SearchQueryOptions } from '@pgshift/core'

export interface BuiltQuery {
  sql: string
  values: unknown[]
}

/**
 * Builds the weighted tsvector expression for upsert.
 *
 * Each indexed field gets its configured weight (A–D, default D).
 * Fields are concatenated with || to form a single weighted tsvector.
 *
 * Example output:
 *   setweight(to_tsvector('english', 'Nike Air Max'), 'A') ||
 *   setweight(to_tsvector('english', 'Classic sneaker'), 'B')
 */
export function buildVectorExpr(
  data: Record<string, unknown>,
  config: SearchIndexConfig,
  language: string,
): string {
  return config.fields
    .map((field) => {
      const weight = config.weights?.[field] ?? 'D'
      const text = String(data[field] ?? '').replace(/'/g, "''")
      return `setweight(to_tsvector('${language}', '${text}'), '${weight}')`
    })
    .join(' || ')
}

/**
 * Builds the SELECT query for full-text search.
 *
 * Standard path: ranks by ts_rank only.
 *
 * Fuzzy path: combines ts_rank + word_similarity.
 * The term is split into individual words via unnest(string_to_array).
 * Each word is compared against raw_text using word_similarity.
 * A document matches if ANY word exceeds the similarity threshold (0.5).
 * This correctly handles multi-word fuzzy queries like "maxx shoes 90".
 *
 * Note: word_similarity threshold is hardcoded at 0.5 in the query itself.
 * SET LOCAL via transaction does not reliably affect operator behavior in pg_trgm.
 *
 * Equality filters from options.filters are appended as AND clauses.
 * Pagination is handled via LIMIT / OFFSET.
 */
export function buildSearchQuery(
  table: string,
  term: string,
  language: string,
  options: SearchQueryOptions,
  indexConfig: SearchIndexConfig,
): BuiltQuery {
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0
  const fuzzy = options.fuzzy ?? indexConfig.fuzzy ?? false

  const filters = options.filters ? Object.entries(options.filters) : []
  const filterClauses = filters
    .map(([key], i) => `AND data->>'${key}' = $${i + 4}`)
    .join('\n          ')
  const filterValues = filters.map(([, v]) => String(v))

  if (fuzzy) {
    return {
      sql: `
        SELECT
          id,
          (
            ts_rank(search_vec, plainto_tsquery($1, $2)) +
            (
              SELECT MAX(word_similarity(word, raw_text))
              FROM unnest(string_to_array($2, ' ')) AS word
            )
          ) / 2 AS rank,
          data
        FROM ${table}
        WHERE (
          search_vec @@ plainto_tsquery($1, $2)
          OR (
            SELECT bool_or(word_similarity(word, raw_text) > 0.5)
            FROM unnest(string_to_array($2, ' ')) AS word
          )
        )
        ${filterClauses}
        ORDER BY rank DESC
        LIMIT $3 OFFSET ${offset}
      `,
      values: [language, term, limit, ...filterValues],
    }
  }

  return {
    sql: `
      SELECT
        id,
        ts_rank(search_vec, plainto_tsquery($1, $2)) AS rank,
        data
      FROM ${table}
      WHERE search_vec @@ plainto_tsquery($1, $2)
      ${filterClauses}
      ORDER BY rank DESC
      LIMIT $3 OFFSET ${offset}
    `,
    values: [language, term, limit, ...filterValues],
  }
}
