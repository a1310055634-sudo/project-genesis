import { describe, expect, it } from 'vitest'
import { checkInvariants, demographicsSystem, MaritalStatus, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'
import { familySystem } from '@genesis/family'

const CONFIG = { seed: 1234, populationTarget: 300, years: 5 }

function buildSim(): Simulation {
  return Simulation.create(CONFIG, {
    systems: [demographicsSystem, ...economySystems(), familySystem()]
  })
}

describe('family full flow (300 residents, 5 years)', () => {
  it('keeps global invariants green and produces marital diversity', () => {
    const sim = buildSim()
    // the monthly invariants system already ran inside the sim; this is the
    // explicit end-of-run gate required by the wave contract
    sim.run()
    const stats = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
    expect(stats.violations).toBe(0)

    const statuses = new Set<MaritalStatus>(sim.ctx.world.persons.filter((p) => p.alive).map((p) => p.maritalStatus))
    const familyStates = (['married', 'widowed', 'divorced'] as const).filter((s) => statuses.has(s))
    expect(familyStates.length).toBeGreaterThanOrEqual(2)

    // the family machinery actually acted during the run (60 months in 5
    // years — endpoint tick fires since RT1-03 fix)
    expect(sim.ctx.metrics.counterValue('family.months_processed')).toBe(60)
    expect(sim.ctx.metrics.counterValue('family.divorces')).toBeGreaterThan(0)
    // widowhood is handled at death time by demographics since RT1-02 —
    // assert the outcome (widowed state + relationship.ended), not which
    // system performed it
    expect(sim.ctx.log.countOf('relationship.ended')).toBeGreaterThan(0)
    expect(sim.ctx.world.persons.some((p) => p.alive && p.maritalStatus === 'widowed')).toBe(true)

    // marriage-pool health gauge (batch 6): matches the raw world state
    const world = sim.ctx.world
    const alive = world.persons.filter((p) => p.alive).length
    const inhabited = world.households.filter((h) => h.memberIds.length > 0).length
    const avgHousehold = sim.ctx.metrics.gaugeValue('family.avg_household_size')
    expect(avgHousehold).toBeGreaterThan(0)
    expect(avgHousehold).toBeCloseTo(inhabited === 0 ? 0 : alive / inhabited, 6)
  }, 240_000)

  it('is deterministic: same seed twice => identical Simulation.digest()', () => {
    const digest = () => {
      const sim = buildSim()
      sim.run()
      return sim.digest()
    }
    const first = digest()
    const second = digest()
    expect(first).toBe(second)
  }, 240_000)
})
