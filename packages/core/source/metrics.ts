import type { MetricSnapshot, MigrationHint, PgShiftModule } from './types'

export class MetricsCollector {
  private snapshots: MetricSnapshot[] = []
  private hintsFired = new Set<string>()

  constructor(private onHint?: (hint: MigrationHint) => void) {}

  record(snapshot: MetricSnapshot): void {
    this.snapshots.push(snapshot)
    this.evaluate(snapshot)
  }

  private evaluate(snapshot: MetricSnapshot): void {
    if (snapshot.module === 'search') this.evaluateSearch(snapshot)
    if (snapshot.module === 'cache') this.evaluateCache(snapshot)
  }

  private evaluateSearch(snapshot: MetricSnapshot): void {
    const key = `search:${snapshot.adapter}:latency`
    if (this.hintsFired.has(key)) return

    const recent = this.recent('search', 100)
    if (recent.length < 100) return

    const avg = recent.reduce((s, m) => s + m.value, 0) / recent.length
    if (avg > 200) {
      this.hintsFired.add(key)
      this.onHint?.({
        module: 'search',
        currentAdapter: snapshot.adapter,
        suggestedAdapter: 'elasticsearch',
        reason: `Average query latency is ${avg.toFixed(0)}ms over the last 100 queries.`,
        urgency: Math.min((avg - 200) / 800, 1),
        learnMoreUrl:
          'https://pgshift.dev/docs/migrate/search-to-elasticsearch',
      })
    }
  }

  private evaluateCache(snapshot: MetricSnapshot): void {
    const key = `cache:${snapshot.adapter}:latency`
    if (this.hintsFired.has(key)) return

    const recent = this.recent('cache', 100)
    if (recent.length < 100) return

    const avg = recent.reduce((s, m) => s + m.value, 0) / recent.length
    if (avg > 50) {
      this.hintsFired.add(key)
      this.onHint?.({
        module: 'cache',
        currentAdapter: snapshot.adapter,
        suggestedAdapter: 'redis',
        reason: `Average read latency is ${avg.toFixed(0)}ms over the last 100 reads.`,
        urgency: Math.min((avg - 50) / 200, 1),
        learnMoreUrl: 'https://pgshift.dev/docs/migrate/cache-to-redis',
      })
    }
  }

  private recent(module: PgShiftModule, n: number): MetricSnapshot[] {
    return this.snapshots.filter((s) => s.module === module).slice(-n)
  }
}
