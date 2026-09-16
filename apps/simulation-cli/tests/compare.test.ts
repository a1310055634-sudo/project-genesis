import { describe, expect, it } from 'vitest'
import type { RunManifest } from '../src/main'
import { compareManifests, formatReport } from '../src/compare'

/** Run compare core (GEN-135 / D1): diff arithmetic, only-in sets, formatter. */

function manifest(
  overrides?: {
    digest?: string
    configHash?: string
    metrics?: Record<string, number>
    alive?: number
    events?: { totalEvents: number; byType: Record<string, number> }
  }
): RunManifest {
  const m: RunManifest = {
    runId: 'run-42-test',
    seed: 42,
    configHash: 'cfg-a',
    tick: 86_400,
    simulatedYears: 10,
    startedAtWallClock: 't0',
    endedAtWallClock: 't1',
    runtimeMs: 1_000,
    digest: 'digest-a',
    population: {
      persons: 10_000,
      alive: 9_920,
      children: 2_000,
      adults: 6_000,
      seniors: 1_920,
      households: 4_000,
      employers: 180,
      employed: 6_100,
      unemploymentRate: 0.05
    },
    metrics: { social_edges: 60_000, media_pieces: 155, from_zero: 0, only_a: 7 },
    events: { totalEvents: 100, byType: { 'person.died': 40, 'media.published': 26 } }
  }
  if (overrides?.digest !== undefined) m.digest = overrides.digest
  if (overrides?.configHash !== undefined) m.configHash = overrides.configHash
  if (overrides?.metrics !== undefined) m.metrics = overrides.metrics
  if (overrides?.alive !== undefined) m.population.alive = overrides.alive
  if (overrides?.events !== undefined) m.events = overrides.events
  return m
}

describe('compareManifests (GEN-135)', () => {
  it('flags digest/configHash identity', () => {
    const a = manifest()
    expect(compareManifests(a, manifest()).digestIdentical).toBe(true)
    const b = manifest({ digest: 'digest-b' })
    expect(compareManifests(a, b).digestIdentical).toBe(false)
    expect(compareManifests(a, b).configHashIdentical).toBe(true)
  })

  it('diffs population and metrics with delta and pct relative to |A|', () => {
    const a = manifest()
    const b = manifest({
      digest: 'digest-b',
      alive: 648,
      metrics: { social_edges: 45_000, media_pieces: 155, from_zero: 5, only_b: 1 }
    })
    const diff = compareManifests(a, b)
    const alive = diff.population.find((r) => r.key === 'alive')
    expect(alive).toBeDefined()
    expect(alive!.delta).toBe(648 - 9_920)
    expect(alive!.pct).toBeCloseTo((648 - 9_920) / 9_920, 12)
    // social_edges halved; media_pieces unchanged → not in changed set
    const edges = diff.metricsChanged.find((r) => r.key === 'social_edges')
    expect(edges?.delta).toBe(-15_000)
    expect(edges?.pct).toBeCloseTo(-0.25, 12)
    expect(diff.metricsChanged.some((r) => r.key === 'media_pieces')).toBe(false)
    // rising from zero: pct is null (no ∞%), delta carries the change
    const zero = diff.metricsChanged.find((r) => r.key === 'from_zero')
    expect(zero?.delta).toBe(5)
    expect(zero?.pct).toBeNull()
    expect(diff.metricsOnlyInA).toEqual(['only_a'])
    expect(diff.metricsOnlyInB).toEqual(['only_b'])
  })

  it('identical manifests produce an empty diff', () => {
    const diff = compareManifests(manifest(), manifest())
    expect(diff.population.every((r) => r.delta === 0)).toBe(true)
    expect(diff.metricsChanged).toEqual([])
    expect(diff.metricsOnlyInA).toEqual([])
    expect(diff.metricsOnlyInB).toEqual([])
    expect(diff.eventsChanged).toEqual([])
  })

  it('formatter emits sectioned markdown with header identity', () => {
    const a = manifest()
    const b = manifest({ digest: 'digest-b', alive: 648 })
    const text = formatReport('a.json', 'b.json', a, b, compareManifests(a, b))
    expect(text).toContain('# Run compare (GEN-135)')
    expect(text).toContain('A: a.json')
    expect(text).toContain('digests identical: no')
    expect(text).toContain('## Population')
    expect(text).toContain('alive: 9920 → 648')
    expect(text).toContain('## Metrics changed')
  })
})
