import { describe, expect, it } from 'vitest'
import {
  distanceOperator,
  distanceToScore,
  vectorTable,
} from '../../../adapters/vector-postgres/source/schema'

describe('vectorTable', () => {
  it('prefixes entity with _pgshift_vector_', () => {
    expect(vectorTable('documents')).toBe('_pgshift_vector_documents')
  })

  it('lowercases the entity name', () => {
    expect(vectorTable('Documents')).toBe('_pgshift_vector_documents')
  })

  it('replaces special characters with underscores', () => {
    expect(vectorTable('blog posts')).toBe('_pgshift_vector_blog_posts')
    expect(vectorTable('blog-posts')).toBe('_pgshift_vector_blog_posts')
  })
})

describe('distanceOperator', () => {
  it('returns <=> for cosine', () => {
    expect(distanceOperator('cosine')).toBe('<=>')
  })

  it('returns <-> for euclidean', () => {
    expect(distanceOperator('euclidean')).toBe('<->')
  })

  it('returns <#> for dotproduct', () => {
    expect(distanceOperator('dotproduct')).toBe('<#>')
  })
})

describe('distanceToScore', () => {
  describe('cosine', () => {
    it('returns 1 when distance is 0 (identical vectors)', () => {
      expect(distanceToScore(0, 'cosine')).toBe(1)
    })

    it('returns 0 when distance is 1 (orthogonal vectors)', () => {
      expect(distanceToScore(1, 'cosine')).toBe(0)
    })

    it('returns 0.5 when distance is 0.5', () => {
      expect(distanceToScore(0.5, 'cosine')).toBeCloseTo(0.5)
    })
  })

  describe('euclidean', () => {
    it('returns 1 when distance is 0 (identical vectors)', () => {
      expect(distanceToScore(0, 'euclidean')).toBe(1)
    })

    it('returns lower score for higher distance', () => {
      const close = distanceToScore(0.5, 'euclidean')
      const far = distanceToScore(2, 'euclidean')
      expect(close).toBeGreaterThan(far)
    })

    it('score is always between 0 and 1', () => {
      for (const d of [0, 0.1, 1, 5, 100]) {
        const score = distanceToScore(d, 'euclidean')
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('dotproduct', () => {
    it('returns 1 when distance is 0', () => {
      expect(distanceToScore(0, 'dotproduct')).toBe(1)
    })

    it('returns higher score for less negative distance', () => {
      const higher = distanceToScore(-0.5, 'dotproduct')
      const lower = distanceToScore(-1.5, 'dotproduct')
      expect(higher).toBeGreaterThan(lower)
    })
  })
})
