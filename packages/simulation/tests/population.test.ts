import { describe, it, expect } from 'vitest'
import { checkInvariants, populationStats, Simulation } from '@genesis/simulation'

describe('population generator (GEN-024)', () => {
  it('creates the target population with households and employers', () => {
    const sim = Simulation.create({ seed: 42, populationTarget: 500, years: 1 }, { checkInvariants: true })
    const stats = populationStats(sim.ctx)
    expect(stats.persons).toBe(500)
    expect(stats.alive).toBe(500)
    expect(stats.households).toBeGreaterThan(100)
    expect(stats.employers).toBeGreaterThan(0)
    expect(stats.employed).toBeGreaterThan(0)
    expect(stats.unemploymentRate).toBeLessThan(1)
    expect(stats.children + stats.adults + stats.seniors).toBe(500)
    // every person belongs to a household at generation time
    for (const p of sim.ctx.world.persons) expect(p.householdId).not.toBeNull()
  })

  it('is deterministic under a fixed seed', () => {
    const a = Simulation.create({ seed: 42, populationTarget: 300, years: 1 })
    const b = Simulation.create({ seed: 42, populationTarget: 300, years: 1 })
    expect(a.ctx.world.persons.map((p) => p.id)).toEqual(b.ctx.world.persons.map((p) => p.id))
    expect(a.ctx.world.households.map((h) => h.memberIds)).toEqual(b.ctx.world.households.map((h) => h.memberIds))
    expect(a.digest()).toBe(b.digest())
  })

  it('differs across seeds', () => {
    const a = Simulation.create({ seed: 42, populationTarget: 300, years: 1 })
    const b = Simulation.create({ seed: 43, populationTarget: 300, years: 1 })
    expect(a.digest()).not.toBe(b.digest())
  })

  it('wage spread knob scales wage std around a stable mean (EXP-029)', () => {
    // 3000 residents -> ~55 employers: enough samples for a stable std ratio
    const wagesFor = (spread: number | undefined) => {
      const sim = Simulation.create({ seed: 42, populationTarget: 3000, years: 1, wageSpreadMultiplier: spread })
      const wages = sim.ctx.world.employers.map((e) => e.monthlyWageCents)
      const mu = wages.reduce((x, y) => x + y, 0) / wages.length
      const variance = wages.reduce((acc, w) => acc + (w - mu) * (w - mu), 0) / wages.length
      return { mean: mu, std: Math.sqrt(variance) }
    }
    const control = wagesFor(undefined)
    const spread = wagesFor(1.4)
    // config-hash semantics: spread=1-explicit and absent are DIFFERENT
    // worlds (different numeric seed), so arms are compared against the
    // absolute design anchor (uniform centered on 510k), not each other
    for (const arm of [control, spread]) {
      expect(Math.abs(arm.mean - 510_000)).toBeLessThan(510_000 * 0.1)
    }
    // std scales with the spread parameter (~1.4x ± sampling noise at n≈55)
    expect(spread.std).toBeGreaterThan(control.std * 1.15)
    expect(spread.std).toBeLessThan(control.std * 2.2) // n≈58 std sampling noise is wide
  })

  it('passes the full invariant suite on a fresh world', () => {
    const sim = Simulation.create({ seed: 7, populationTarget: 400, years: 1 })
    const result = checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)
    expect(result.violations).toBe(0)
    expect(result.checks).toBeGreaterThan(400)
  })
})
