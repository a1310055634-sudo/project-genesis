import { describe, it, expect } from 'vitest'
import { checkInvariants } from '@genesis/simulation'
import { Simulation } from '@genesis/simulation'
import { fullStackSystems } from '../src/profile'

describe('full-stack integration (GEN-115)', () => {
  it('runs demography + economy + social + psychology together, invariants green', () => {
    const { systems } = fullStackSystems()
    const sim = Simulation.create({ seed: 42, populationTarget: 300, years: 3 }, { systems })
    sim.run()

    // full suite still green with all systems mutating shared state
    const result = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
    expect(result.violations).toBe(0)

    const stats = sim.ctx.log.stats()
    expect(stats.byType['income.received']).toBeGreaterThan(0)
    expect(stats.byType['consumption.paid']).toBeGreaterThan(0)
    expect(stats.byType['relationship.started']).toBeGreaterThan(0)
    expect(stats.byType['person.died']).toBeGreaterThanOrEqual(0)

    // psychology recorded population-level metrics
    expect(sim.ctx.metrics.statsOf('stress')).not.toBeNull()
    expect(sim.ctx.metrics.statsOf('stress')?.mean ?? -1).toBeGreaterThanOrEqual(0)
    expect(sim.ctx.metrics.statsOf('stress')?.mean ?? 2).toBeLessThanOrEqual(1)
    expect(sim.ctx.metrics.gaugeValue('social_edges')).toBeGreaterThan(0)
    expect(sim.ctx.metrics.gaugeValue('employment_rate')).toBeGreaterThan(0)
  })

  it('is deterministic with the full stack', () => {
    const run = () => {
      const { systems } = fullStackSystems()
      const sim = Simulation.create({ seed: 2026, populationTarget: 120, years: 2 }, { systems })
      sim.run()
      return sim.digest()
    }
    expect(run()).toBe(run())
  })

  it('unemployment pressure raises cohort stress (EXP-002 direction, model-internal)', () => {
    const build = (employmentRate: number) => {
      const { systems } = fullStackSystems()
      const sim = Simulation.create(
        { seed: 42, populationTarget: 200, years: 2, employmentRate },
        { systems, checkInvariants: false }
      )
      sim.run()
      return sim.ctx.metrics.statsOf('stress')?.mean ?? -1
    }
    const lowEmployment = build(0.05)
    const highEmployment = build(0.95)
    // model-internal validation only — NOT a real-world causal claim
    expect(lowEmployment).toBeGreaterThan(highEmployment)
  })
})
