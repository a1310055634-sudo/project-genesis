import type { RunManifest } from './main'

/**
 * Run compare (GEN-135 / Roadmap D1): diff two run manifests — identity,
 * population structure, and the full metrics snapshot. Pure functions; the
 * CLI (compare-cli.ts) only does argv/fs wiring.
 *
 * Percent convention: Δ relative to |A| (sign carries direction); null when
 * A is 0 (a share/rate rising from zero reads as "new" rather than ∞%).
 */

export interface DiffRow {
  key: string
  a: number
  b: number
  delta: number
  /** (b - a) / |a|; null when a === 0 */
  pct: number | null
}

export interface ManifestDiff {
  digestIdentical: boolean
  configHashIdentical: boolean
  population: DiffRow[]
  metricsChanged: DiffRow[]
  metricsOnlyInA: string[]
  metricsOnlyInB: string[]
  eventsChanged: DiffRow[]
}

const EPS = 1e-9

function diffRow(key: string, a: number, b: number): DiffRow {
  return { key, a, b, delta: b - a, pct: a === 0 ? null : (b - a) / Math.abs(a) }
}

function byAbsDelta(x: DiffRow, y: DiffRow): number {
  return Math.abs(y.delta) - Math.abs(x.delta)
}

export function compareManifests(a: RunManifest, b: RunManifest): ManifestDiff {
  const population = Object.keys(a.population)
    .filter((key) => key in b.population)
    .map((key) => diffRow(key, a.population[key as keyof RunManifest['population']], b.population[key as keyof RunManifest['population']]))
    .sort(byAbsDelta)

  const keysA = new Set(Object.keys(a.metrics))
  const keysB = new Set(Object.keys(b.metrics))
  const metricsOnlyInA = [...keysA].filter((k) => !keysB.has(k)).sort()
  const metricsOnlyInB = [...keysB].filter((k) => !keysA.has(k)).sort()
  const metricsChanged = [...keysA]
    .filter((k) => keysB.has(k) && Math.abs(b.metrics[k] - a.metrics[k]) > EPS)
    .map((k) => diffRow(k, a.metrics[k], b.metrics[k]))
    .sort(byAbsDelta)

  const eventKeys = new Set([...Object.keys(a.events.byType), ...Object.keys(b.events.byType)])
  const eventsChanged = [...eventKeys]
    .map((k) => diffRow(k, a.events.byType[k] ?? 0, b.events.byType[k] ?? 0))
    .filter((r) => Math.abs(r.delta) > EPS)
    .sort(byAbsDelta)

  return {
    digestIdentical: a.digest === b.digest,
    configHashIdentical: a.configHash === b.configHash,
    population,
    metricsChanged,
    metricsOnlyInA,
    metricsOnlyInB,
    eventsChanged
  }
}

const fmt = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return (v / 1e9).toFixed(2) + 'B'
  if (abs >= 1_000_000) return (v / 1e6).toFixed(2) + 'M'
  if (abs >= 10_000) return (v / 1e3).toFixed(1) + 'k'
  if (abs >= 1 || abs === 0) return String(Math.round(v * 100) / 100)
  return v.toExponential(2)
}

const fmtRow = (r: DiffRow): string => {
  const pct = r.pct === null ? '—' : (r.pct * 100).toFixed(1) + '%'
  return `${r.key}: ${fmt(r.a)} → ${fmt(r.b)}  (Δ ${fmt(r.delta)}, ${pct})`
}

export function formatReport(aPath: string, bPath: string, a: RunManifest, b: RunManifest, diff: ManifestDiff): string {
  const lines: string[] = []
  lines.push('# Run compare (GEN-135)')
  lines.push(`A: ${aPath}  (seed ${a.seed}, ${a.simulatedYears}y, digest ${a.digest})`)
  lines.push(`B: ${bPath}  (seed ${b.seed}, ${b.simulatedYears}y, digest ${b.digest})`)
  lines.push(`digests identical: ${diff.digestIdentical ? 'YES' : 'no'} | configHash identical: ${diff.configHashIdentical ? 'YES' : 'no'}`)
  lines.push('')
  lines.push('## Population')
  for (const row of diff.population) lines.push(fmtRow(row))
  lines.push('')
  lines.push(`## Metrics changed (${diff.metricsChanged.length})`)
  const cap = 40
  for (const row of diff.metricsChanged.slice(0, cap)) lines.push(fmtRow(row))
  if (diff.metricsChanged.length > cap) lines.push(`… ${diff.metricsChanged.length - cap} more`)
  lines.push('')
  lines.push(`## Metrics only in A (${diff.metricsOnlyInA.length})`)
  for (const key of diff.metricsOnlyInA.slice(0, 20)) lines.push(key)
  if (diff.metricsOnlyInA.length > 20) lines.push(`… ${diff.metricsOnlyInA.length - 20} more`)
  lines.push('')
  lines.push(`## Metrics only in B (${diff.metricsOnlyInB.length})`)
  for (const key of diff.metricsOnlyInB.slice(0, 20)) lines.push(key)
  if (diff.metricsOnlyInB.length > 20) lines.push(`… ${diff.metricsOnlyInB.length - 20} more`)
  lines.push('')
  lines.push(`## Event types changed (${diff.eventsChanged.length})`)
  for (const row of diff.eventsChanged.slice(0, 25)) lines.push(fmtRow(row))
  if (diff.eventsChanged.length > 25) lines.push(`… ${diff.eventsChanged.length - 25} more`)
  return lines.join('\n')
}
