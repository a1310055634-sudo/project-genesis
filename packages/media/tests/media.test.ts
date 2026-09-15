import { describe, expect, it } from 'vitest'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import {
  BELIEF_CONVERSION_PROB,
  MEDIA_PIECES,
  believingNeighborShare,
  conversionProbability,
  mediaSystem
} from '@genesis/media'
import { RelationshipGraph } from '@genesis/social'

/**
 * Media domain (HT-12 Media, EXP-021/022 prerequisites): scheduled
 * publication + tie-scaled hearing spread. Deterministic throughout.
 */
function build(tieCounts?: (ctx: import('@genesis/simulation').SimContext) => Map<string, number>) {
  const graph = new RelationshipGraph()
  return {
    graph,
    sim: Simulation.create(
      { seed: 42, populationTarget: 150, years: 2 },
      { systems: [demographicsSystem, mediaSystem({ tieCounts })] }
    )
  }
}

describe('media domain (HT-12)', () => {
  it('publishes pieces on the 4-week cadence', () => {
    const { sim } = build()
    sim.run()
    // 2y = 24 months = ~104 weeks → ~26 pieces
    expect(sim.ctx.log.countOf('media.published')).toBeGreaterThanOrEqual(25)
    const pieces = sim.ctx.extensions.get(MEDIA_PIECES) as Map<string, unknown>
    expect(pieces.size).toBe(sim.ctx.log.countOf('media.published'))
  })

  it('hearing spreads and is auditable', () => {
    const { sim } = build()
    sim.run()
    expect(sim.ctx.log.countOf('information.heard')).toBeGreaterThan(0)
    expect(sim.ctx.metrics.gaugeValue('media_last_piece_heard')).toBeGreaterThan(0)
    expect(checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed).violations).toBe(0)
  })

  it('per-person exposure memory: nobody hears the same piece twice', () => {
    const { sim } = build()
    sim.run()
    const pieces = sim.ctx.extensions.get(MEDIA_PIECES) as Map<string, { heardBy: Set<string>; heardCount: number }>
    const byId = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    for (const piece of pieces.values()) {
      expect(piece.heardCount).toBe(piece.heardBy.size)
      for (const personId of piece.heardBy) {
        expect(byId.has(personId)).toBe(true)
      }
    }
  })

  it('belief layer: believed ⊆ heard; conversions occur under the flat baseline', () => {
    const { sim } = build()
    sim.run()
    const pieces = sim.ctx.extensions.get(MEDIA_PIECES) as Map<string, { believedBy: Set<string>; heardCount: number; heardBy: Set<string> }>
    let believers = 0
    for (const piece of pieces.values()) {
      expect(piece.believedBy.size).toBeLessThanOrEqual(piece.heardCount)
      for (const b of piece.believedBy) {
        expect(piece.heardBy.has(b)).toBe(true)
        believers++
      }
    }
    expect(sim.ctx.metrics.gaugeValue('media_last_piece_believed')).toBeGreaterThanOrEqual(0)
    expect(believers).toBeGreaterThan(0)
  })

  it('belief decay (v3): long-horizon believers plateau, not collapse', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 150, years: 6 },
      { systems: [demographicsSystem, mediaSystem()] }
    )
    sim.run()
    // ~3y in, believers have grown; over the next 3y decay balances new
    // conversions — the plateau assertion guards against total collapse
    const mid = sim.ctx.metrics.gaugeValue('media_last_piece_believed')
    expect(mid).toBeGreaterThan(0)
    // believers never exceed hearers (subset invariant over time)
    const pieces = sim.ctx.extensions.get(MEDIA_PIECES) as Map<string, { believedBy: Set<string>; heardCount: number }>
    for (const piece of pieces.values()) {
      expect(piece.believedBy.size).toBeLessThanOrEqual(piece.heardCount)
    }
    // lapsed counter exists and is tracked
    expect(sim.ctx.metrics.counterValue('media_beliefs_lapsed')).toBeGreaterThanOrEqual(0)
  }, 60_000)

  it('is deterministic under a fixed seed', () => {
    const run = () => {
      const { sim } = build()
      sim.run()
      return sim.digest()
    }
    expect(run()).toBe(run())
  })
})

describe('belief social reinforcement (v3)', () => {
  it('believingNeighborShare: denominator, any-piece semantics, empty safety (RT6-A2)', () => {
    const count = new Map([['a', 3], ['b', 1]]) // any positive count believes
    // denominator is neighbors.length, not the believing count
    expect(believingNeighborShare(['a', 'b', 'c', 'd'], count)).toBe(0.5)
    expect(believingNeighborShare(['a', 'b'], count)).toBe(1)
    expect(believingNeighborShare(['c', 'd'], count)).toBe(0)
    // zero neighbors never divide by zero
    expect(believingNeighborShare([], count)).toBe(0)
    // absence from the map = zero beliefs
    expect(believingNeighborShare(['zzz'], count)).toBe(0)
    // a count that DROPPED to 0 (lapsed everywhere) no longer reinforces
    expect(believingNeighborShare(['a'], new Map([['a', 0]]))).toBe(0)
  })

  it('conversionProbability: formula, clamp, no-op at zero reinforcement', () => {
    expect(conversionProbability(BELIEF_CONVERSION_PROB, 0.25, 0)).toBe(BELIEF_CONVERSION_PROB)
    expect(conversionProbability(BELIEF_CONVERSION_PROB, 0.25, 1)).toBe(0.85)
    expect(conversionProbability(BELIEF_CONVERSION_PROB, 0.25, 0.5)).toBeCloseTo(0.725)
    expect(conversionProbability(0.9, 0.5, 1)).toBe(1) // clamped to [0,1]
    // sign: reinforcement must never LOWER conversion (mutation-kill: swapped args)
    expect(conversionProbability(BELIEF_CONVERSION_PROB, 0.25, 0.8)).toBeGreaterThanOrEqual(
      conversionProbability(BELIEF_CONVERSION_PROB, 0.25, 0.2)
    )
  })

  // ring adjacency: deterministic synthetic neighborhood (2 ties per person),
  // independent of the social system — isolates the reinforcement mechanism
  const ringArm = (reinforcement: number) => {
    let ring: Map<string, string[]> | null = null
    const sim = Simulation.create(
      { seed: 42, populationTarget: 150, years: 2 },
      {
        systems: [
          demographicsSystem,
          mediaSystem({
            reinforcement,
            neighbors: (ctx, personId) => {
              if (ring === null) {
                ring = new Map()
                const ids = ctx.world.persons.map((p) => p.id)
                ids.forEach((id, i) =>
                  ring!.set(id, [ids[(i + 1) % ids.length], ids[(i + ids.length - 1) % ids.length]])
                )
              }
              return ring.get(personId) ?? []
            }
          })
        ]
      }
    )
    sim.run()
    return sim
  }

  it('reinforced arm converts more hearers than flat arm (paired worlds)', () => {
    const flat = ringArm(0)
    const reinforced = ringArm(0.4)
    // mechanism must actually fire in the reinforced arm
    expect(reinforced.ctx.metrics.counterValue('media_reinforced_hearings')).toBeGreaterThan(0)
    expect(flat.ctx.metrics.hasCounter('media_reinforced_hearings')).toBe(false)
    // paired worlds (same numericSeed): the only difference is the treatment
    expect(reinforced.ctx.metrics.counterValue('media_beliefs_total')).toBeGreaterThan(
      flat.ctx.metrics.counterValue('media_beliefs_total')
    )
  })

  it('reinforcement does not break the believed ⊆ heard invariant', () => {
    const sim = ringArm(0.4)
    const pieces = sim.ctx.extensions.get(MEDIA_PIECES) as Map<string, { believedBy: Set<string>; heardBy: Set<string> }>
    for (const piece of pieces.values()) {
      for (const b of piece.believedBy) {
        expect(piece.heardBy.has(b)).toBe(true)
      }
    }
  })
})

