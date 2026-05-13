import { describe, expect, it, vi } from 'vitest'
import { MetricsCollector } from '../../../packages/core/source/metrics'
import type { MetricSnapshot } from '../../../packages/core/source/types'

function makeSnapshot(
  module: MetricSnapshot['module'],
  value: number,
  adapter = 'postgres',
): MetricSnapshot {
  return {
    module,
    adapter,
    timestamp: new Date(),
    value,
    unit: 'ms',
  }
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

describe('MetricsCollector', () => {
  describe('record', () => {
    it('records a snapshot without throwing', () => {
      const collector = new MetricsCollector()

      expect(() => collector.record(makeSnapshot('search', 10))).not.toThrow()
    })

    it('does not fire a hint when there are fewer than 100 snapshots', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 99; i++) {
        collector.record(makeSnapshot('search', 300))
      }

      expect(onHint).not.toHaveBeenCalled()
    })
  })

  describe('search migration hint', () => {
    it('fires a hint when avg search latency exceeds 200ms over 100 queries', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('search', 300))
      }

      expect(onHint).toHaveBeenCalledOnce()
      expect(onHint).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'search',
          currentAdapter: 'postgres',
          suggestedAdapter: 'elasticsearch',
        }),
      )
    })

    it('does not fire a hint when avg search latency is below 200ms', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('search', 100))
      }

      expect(onHint).not.toHaveBeenCalled()
    })

    it('fires the hint only once per session regardless of how many snapshots follow', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 200; i++) {
        collector.record(makeSnapshot('search', 300))
      }

      expect(onHint).toHaveBeenCalledOnce()
    })

    it('includes an urgency score between 0 and 1', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('search', 500))
      }

      const hint = onHint.mock.calls[0]![0]
      expect(hint.urgency).toBeGreaterThan(0)
      expect(hint.urgency).toBeLessThanOrEqual(1)
    })

    it('includes a learnMoreUrl', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('search', 300))
      }

      expect(onHint.mock.calls[0]![0].learnMoreUrl).toBeDefined()
    })
  })

  describe('cache migration hint', () => {
    it('fires a hint when avg cache latency exceeds 50ms over 100 reads', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('cache', 100))
      }

      expect(onHint).toHaveBeenCalledOnce()
      expect(onHint).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'cache',
          suggestedAdapter: 'redis',
        }),
      )
    })

    it('does not fire a hint when avg cache latency is below 50ms', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('cache', 20))
      }

      expect(onHint).not.toHaveBeenCalled()
    })

    it('fires the cache hint only once per session', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 200; i++) {
        collector.record(makeSnapshot('cache', 100))
      }

      expect(onHint).toHaveBeenCalledOnce()
    })
  })

  describe('queue migration hint', () => {
    it('fires a hint when avg queue latency exceeds 500ms over 100 jobs', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('queue', 800))
      }

      expect(onHint).toHaveBeenCalledOnce()
      expect(onHint).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'queue',
          suggestedAdapter: 'bullmq',
        }),
      )
    })

    it('does not fire a hint when avg queue latency is below 500ms', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('queue', 300))
      }

      expect(onHint).not.toHaveBeenCalled()
    })

    it('fires the queue hint only once per session', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 200; i++) {
        collector.record(makeSnapshot('queue', 800))
      }

      expect(onHint).toHaveBeenCalledOnce()
    })

    it('includes an urgency score between 0 and 1', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('queue', 2000))
      }

      const hint = onHint.mock.calls[0]![0]
      expect(hint.urgency).toBeGreaterThan(0)
      expect(hint.urgency).toBeLessThanOrEqual(1)
    })

    it('includes a learnMoreUrl', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('queue', 800))
      }

      expect(onHint.mock.calls[0]![0].learnMoreUrl).toBeDefined()
    })
  })

  describe('hint isolation', () => {
    it('fires hints independently for search, cache, and queue', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('search', 300))
      }

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('cache', 100))
      }

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('queue', 800))
      }

      expect(onHint).toHaveBeenCalledTimes(3)
    })

    it('does not fire a search hint based on cache snapshots', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('cache', 300))
      }

      const searchHint = onHint.mock.calls.find((c) => c[0].module === 'search')
      expect(searchHint).toBeUndefined()
    })

    it('does not fire a queue hint based on search or cache snapshots', () => {
      const onHint = vi.fn()
      const collector = new MetricsCollector(onHint)

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('search', 300))
      }

      for (let i = 0; i < 100; i++) {
        collector.record(makeSnapshot('cache', 100))
      }

      const queueHint = onHint.mock.calls.find((c) => c[0].module === 'queue')
      expect(queueHint).toBeUndefined()
    })
  })

  describe('works without onHint callback', () => {
    it('does not throw when no callback is provided', () => {
      const collector = new MetricsCollector()

      expect(() => {
        for (let i = 0; i < 100; i++) {
          collector.record(makeSnapshot('search', 300))
        }
      }).not.toThrow()
    })
  })
})
