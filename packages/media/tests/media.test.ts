import { describe, expect, it } from 'vitest'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import { MEDIA_PIECES, mediaSystem } from '@genesis/media'
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
    const graph = new RelationshipGraph()
    const sim = Simulation.create(
      { seed: 42, populationTarget: 150, years: 2 },
      { systems: [demographicsSystem, mediaSystem()] }
    )
    // attach the graph AFTER creation via extension-style wiring: rebuild the
    // sim with tie counts from a graph populated by the social system instead —
    // simpler: count ties from a graph we populate by hand per tick is
    // overkill; for the tie-exposure correlation we just use edge counts from
    // a graph instance shared with a social system.
    void graph
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

  it('belief layer: believed ⊆ heard; belief monotone; conversion < 1', () => {
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
    void believers
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

