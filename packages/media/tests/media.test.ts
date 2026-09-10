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

  it('is deterministic under a fixed seed', () => {
    const run = () => {
      const { sim } = build()
      sim.run()
      return sim.digest()
    }
    expect(run()).toBe(run())
  })
})

