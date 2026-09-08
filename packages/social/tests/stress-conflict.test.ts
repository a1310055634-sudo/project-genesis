import { describe, expect, it } from 'vitest'
import { digest, stableStringify } from '@genesis/shared'
import { RelationshipGraph, TICKS_PER_WEEK, weeklySocialUpdate } from '@genesis/social'
import { makeContext, makePerson } from './helpers'

/**
 * GEN-058: two housemates, bit-identical construction apart from
 * psychology.stress. Same seed ⇒ same rng draw sequence ⇒ the same
 * interactions happen in both worlds; only the conflict delta differs via
 * STRESS_CONFLICT_WEIGHT × mean(stress).
 */
function runPairWeeks(stress: number, weeks: number, seed: number | string = 2026) {
  const a = makePerson('a', { householdId: 'h1' })
  const b = makePerson('b', { householdId: 'h1' })
  a.psychology = { ...a.psychology, stress }
  b.psychology = { ...b.psychology, stress }
  const ctx = makeContext(seed, [a, b])
  ctx.world.households.push({ id: 'h1', memberIds: ['a', 'b'] })
  const graph = new RelationshipGraph()
  for (let w = 0; w < weeks; w++) {
    weeklySocialUpdate(ctx, graph)
    ctx.clock.advance(TICKS_PER_WEEK)
  }
  const edges = graph.allEdges()
  return { graph, edges }
}

function meanConflict(edges: { conflict: number }[]): number {
  return edges.reduce((sum, e) => sum + e.conflict, 0) / edges.length
}

describe('GEN-058 stress → conflict pathway (social side)', () => {
  it('a high-stress pair accumulates more edge conflict than an identical low-stress pair', () => {
    const low = runPairWeeks(0.05, 12)
    const high = runPairWeeks(0.95, 12)
    expect(low.edges.length).toBeGreaterThan(0)
    expect(high.edges.length).toBe(low.edges.length) // same draws ⇒ same interactions
    // Measured with this construction (seed 2026, 12 weeks, 8 interactions):
    // low = 0.1409, high = 0.5729 — the 0.06-weight stress delta is ~4× the
    // baseline, so a 2× margin stays far clear of both sides.
    expect(meanConflict(high.edges)).toBeGreaterThan(meanConflict(low.edges))
    expect(meanConflict(high.edges)).toBeGreaterThan(2 * meanConflict(low.edges))
  })

  it('the stress term only enters the formula — no extra rng draws shift other edge fields', () => {
    const low = runPairWeeks(0.05, 12)
    const high = runPairWeeks(0.95, 12)
    for (let i = 0; i < low.edges.length; i++) {
      expect(high.edges[i].familiarity).toBe(low.edges[i].familiarity)
      expect(high.edges[i].liking).toBe(low.edges[i].liking)
      expect(high.edges[i].trust).toBe(low.edges[i].trust)
      expect(high.edges[i].conflict).toBeGreaterThanOrEqual(low.edges[i].conflict)
    }
  })

  it('determinism holds — same seed twice ⇒ identical edge digest', () => {
    const first = runPairWeeks(0.7, 12)
    const second = runPairWeeks(0.7, 12)
    expect(first.edges.length).toBeGreaterThan(0)
    expect(digest(stableStringify(first.edges))).toBe(digest(stableStringify(second.edges)))
  })
})
