import { describe, it, expect } from 'vitest'
import { demographicsSystem, Simulation, checkInvariants } from '@genesis/simulation'
import { fullStackSystems } from '../../../apps/simulation-cli/src/profile'

/**
 * Fuzz / scenario pack (guide §24.3, HT-27 IDLE pool): drive the engine with
 * EXTREME configurations and assert it never crashes, never violates global
 * invariants, and stays deterministic. These are model-internal robustness
 * checks — not statements about real demographics.
 */

interface Scenario {
  name: string
  seed: number | string
  population: number
  years: number
  overrides?: { birthProbabilityPerMonth?: number; employmentRate?: number }
  fullStack?: boolean
}

const SCENARIOS: Scenario[] = [
  { name: 'single resident', seed: 42, population: 1, years: 1, fullStack: true },
  { name: 'tiny world, max births, no jobs', seed: 'chaos', population: 6, years: 2, overrides: { birthProbabilityPerMonth: 1, employmentRate: 0 }, fullStack: true },
  { name: 'full employment', seed: 42, population: 120, years: 2, overrides: { employmentRate: 1 }, fullStack: true },
  { name: 'zero births', seed: 42, population: 100, years: 1, overrides: { birthProbabilityPerMonth: 0 }, fullStack: true },
  { name: 'quarter-year horizon', seed: 42, population: 80, years: 0.25, fullStack: true },
  { name: 'unicode seed', seed: '创世纪-🌍-42', population: 60, years: 1, fullStack: true },
  { name: 'demographic collapse (30y tiny world)', seed: 42, population: 8, years: 30, fullStack: true },
  { name: 'max births + full employment', seed: 42, population: 60, years: 2, overrides: { birthProbabilityPerMonth: 1, employmentRate: 1 }, fullStack: true }
]

describe('fuzz / extreme scenarios (guide §24.3)', () => {
  for (const scenario of SCENARIOS) {
    it(`survives: ${scenario.name}`, () => {
      const build = (): Simulation => {
        const systems = scenario.fullStack ? fullStackSystems().systems : [demographicsSystem]
        return Simulation.create(
          {
            seed: scenario.seed,
            populationTarget: scenario.population,
            years: scenario.years,
            ...(scenario.overrides ?? {})
          },
          { systems }
        )
      }
      const a = build()
      expect(() => a.run()).not.toThrow()

      // invariants hold at the endpoint world (whatever survived)
      const stats = checkInvariants(a.ctx.world, a.ctx.clock.tick, a.ctx.world.seed)
      expect(stats.violations).toBe(0)

      // determinism: same scenario rebuilds to an identical digest
      const b = build()
      b.run()
      expect(a.digest()).toBe(b.digest())

      // every recorded metric stayed finite
      for (const [key, value] of Object.entries(a.ctx.metrics.snapshot())) {
        expect(Number.isFinite(value), `metric ${key} = ${value}`).toBe(true)
      }
    })
  }

  it('zero birth probability is accepted and produces no births', () => {
    const sim = Simulation.create({ seed: 42, populationTarget: 50, years: 2, birthProbabilityPerMonth: 0 })
    const bornBefore = sim.ctx.log.countOf('person.born')
    sim.run()
    expect(sim.ctx.log.countOf('person.born')).toBe(bornBefore)
  })

  it('rejects out-of-domain config instead of failing mid-run', () => {
    expect(() => Simulation.create({ populationTarget: 0 })).toThrow(/populationTarget/)
    expect(() => Simulation.create({ years: -1 })).toThrow(/years/)
    expect(() => Simulation.create({ birthProbabilityPerMonth: 2 })).toThrow(/birthProbabilityPerMonth/)
    expect(() => Simulation.create({ employmentRate: 1.5 })).toThrow(/employmentRate/)
  })
})
