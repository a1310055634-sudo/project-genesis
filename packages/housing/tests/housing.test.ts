import { describe, expect, it } from 'vitest'
import { TICKS_PER_MONTH } from '@genesis/core'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import { housingBurdenOf, housingSystem, HOUSING_BASE_RENT_CENTS } from '@genesis/housing'

/**
 * Housing domain (HT-12): side-table units, burden indicator, EXP-004 knob.
 * Rent is a burden INDICATOR in v1 — no money flow (documented simplification).
 */
function build(multiplier: number) {
  return Simulation.create(
    { seed: 42, populationTarget: 150, years: 2, housingCostMultiplier: multiplier },
    { systems: [demographicsSystem, housingSystem()] }
  )
}

describe('housing domain (HT-12)', () => {
  it('assigns units to all non-empty households and drops orphaned units', () => {
    const sim = build(1)
    sim.run()
    const households = sim.ctx.world.households.filter((h) => h.memberIds.length > 0)
    const units = sim.ctx.extensions.get('housing.units') as Map<string, unknown>
    expect(units.size).toBe(households.length)
    // GC'd empty households hold no unit
    for (const h of sim.ctx.world.households) {
      if (h.memberIds.length === 0) expect(units.has(h.id)).toBe(false)
    }
    expect(checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed).violations).toBe(0)
  })

  it('cost multiplier scales rent and the burden indicator responds', () => {
    const base = build(1)
    base.run()
    const high = build(2)
    high.run()
    const burdenBase = base.ctx.metrics.gaugeValue('housing_mean_burden')
    const burdenHigh = high.ctx.metrics.gaugeValue('housing_mean_burden')
    expect(burdenHigh).toBeGreaterThan(burdenBase)
    expect(burdenHigh).toBeLessThanOrEqual(1)
  })

  it('burden indicator stays in [0, 1] for alive residents', () => {
    const sim = build(2)
    sim.run()
    let checked = 0
    for (const person of sim.ctx.world.persons) {
      if (!person.alive || person.householdId === null) continue
      const burden = housingBurdenOf(sim.ctx, person)
      expect(burden).toBeGreaterThanOrEqual(0)
      expect(burden).toBeLessThanOrEqual(1)
      checked++
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('is deterministic under a fixed seed', () => {
    const a = build(2)
    a.run()
    const b = build(2)
    b.run()
    expect(a.digest()).toBe(b.digest())
  })

  it('rent baseline is integer cents', () => {
    expect(Number.isInteger(HOUSING_BASE_RENT_CENTS)).toBe(true)
    expect(Number.isInteger(TICKS_PER_MONTH * 0)).toBe(true)
  })
})
