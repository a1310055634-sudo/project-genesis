/**
 * Metrics registry (GEN-012): counters, gauges and cheap streaming stats.
 * Snapshots have sorted keys so they serialize deterministically.
 */
export interface NumericStats {
  count: number
  mean: number
  min: number
  max: number
}

export class MetricsRegistry {
  private counters = new Map<string, number>()
  private gauges = new Map<string, number>()
  private stats = new Map<string, { count: number; sum: number; min: number; max: number }>()

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by)
  }

  gauge(name: string, value: number): void {
    if (!Number.isFinite(value)) throw new Error(`gauge ${name} must be finite, got ${value}`)
    this.gauges.set(name, value)
  }

  record(name: string, value: number): void {
    if (!Number.isFinite(value)) throw new Error(`recorded metric ${name} must be finite, got ${value}`)
    const cur = this.stats.get(name)
    if (cur === undefined) {
      this.stats.set(name, { count: 1, sum: value, min: value, max: value })
    } else {
      cur.count++
      cur.sum += value
      if (value < cur.min) cur.min = value
      if (value > cur.max) cur.max = value
    }
  }

  counterValue(name: string): number {
    return this.counters.get(name) ?? 0
  }

  gaugeValue(name: string): number {
    return this.gauges.get(name) ?? 0
  }

  /** Whether the gauge was ever set this run (GEN-151b: lets samplers
   * distinguish 'recorded 0' from 'never recorded'). */
  hasGauge(name: string): boolean {
    return this.gauges.has(name)
  }

  statsOf(name: string): NumericStats | null {
    const cur = this.stats.get(name)
    if (cur === undefined) return null
    return { count: cur.count, mean: cur.sum / cur.count, min: cur.min, max: cur.max }
  }

  /** Deterministic snapshot: ALL keys globally sorted, values rounded to 6 decimals to avoid float noise in digests. */
  snapshot(): Record<string, number> {
    const pairs: Array<[string, number]> = []
    for (const [name, v] of this.counters) pairs.push([name, v])
    for (const [name, v] of this.gauges) pairs.push([name, round6(v)])
    for (const [name, cur] of this.stats) {
      pairs.push([`${name}.count`, cur.count])
      pairs.push([`${name}.mean`, round6(cur.sum / cur.count)])
      pairs.push([`${name}.min`, round6(cur.min)])
      pairs.push([`${name}.max`, round6(cur.max)])
    }
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    const out: Record<string, number> = {}
    for (const [k, v] of pairs) out[k] = v
    return out
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
