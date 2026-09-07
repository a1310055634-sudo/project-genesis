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

  it('passes the full invariant suite on a fresh world', () => {
    const sim = Simulation.create({ seed: 7, populationTarget: 400, years: 1 })
    const result = checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)
    expect(result.violations).toBe(0)
    expect(result.checks).toBeGreaterThan(400)
  })
})
