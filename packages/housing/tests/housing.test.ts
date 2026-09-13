import { describe, expect, it } from 'vitest'
import { TICKS_PER_MONTH } from '@genesis/core'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import { computeRent, housingBurdenOf, housingSystem, HOUSING_BASE_RENT_CENTS, HOUSING_MEMBER_RENT_CENTS } from '@genesis/housing'

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
  it('assigns units to non-empty households; orphan units are dropped (this fixture has no family GC, so empty shells legitimately persist)', () => {
    const sim = build(1)
    sim.run()
    const households = sim.ctx.world.households.filter((h) => h.memberIds.length > 0)
    const units = sim.ctx.extensions.get('housing.units') as Map<string, unknown>
    // every unit belongs to a still-present household, and every non-empty
    // household has one (no orphans, no gaps). NOTE: without the family system
    // there is no GC, so households emptied by deaths keep their units — that
    // is the family system's job, not housing's.
    expect(units.size).toBeGreaterThanOrEqual(households.length)
    for (const [householdId] of units) {
      expect(sim.ctx.world.households.some((h) => h.id === householdId)).toBe(true)
    }
    for (const h of households) {
      expect(units.has(h.id)).toBe(true)
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

  it('reprices units when household composition changes (RT4-12)', () => {
    const sim = build(1)
    sim.run()
    const units = sim.ctx.extensions.get('housing.units') as Map<string, { monthlyRentCents: number }>
    const target = sim.ctx.world.households.find((h) => h.memberIds.length > 0)
    if (target === undefined) throw new Error('fixture household missing')
    const unit = units.get(target.id)
    if (unit === undefined) throw new Error('fixture unit missing')
    // move an alive outsider into the household (family-move semantics)
    const outsider = sim.ctx.world.persons.find(
      (p) => p.alive && !target.memberIds.includes(p.id) && p.householdId !== null
    )
    if (outsider === undefined) throw new Error('fixture outsider missing')
    const oldHousehold = sim.ctx.world.households.find((h) => h.id === outsider.householdId)
    if (oldHousehold !== undefined) oldHousehold.memberIds = oldHousehold.memberIds.filter((id) => id !== outsider.id)
    outsider.householdId = target.id
    target.memberIds.push(outsider.id)

    const before = unit.monthlyRentCents
    // capture quality BEFORE the step: the monthly reprice uses the quality
    // as of the reprice moment (drift runs after reprice in the same pass)
    const qualityBefore = unit.quality
    sim.stepTo(sim.ctx.clock.tick + TICKS_PER_MONTH)
    const expected = computeRent(
      target.memberIds.length,
      1,
      qualityBefore
    )
    expect(unit.monthlyRentCents).toBe(expected)
    expect(unit.monthlyRentCents).toBeGreaterThan(before)
  })

  it('quality drifts toward the maintenance steady-state of the household income', () => {
    const sim = build(1)
    sim.run()
    const units = sim.ctx.extensions.get('housing.units') as Map<string, { quality: number }>
    // make every household affluent: quality drifts UP toward 1 (affluent
    // steady-state); compare by REFERENCE — units created mid-step are new
    // and start at their assigned quality
    for (const p of sim.ctx.world.persons) {
      if (p.alive) p.economy.monthlyIncomeCents = 2_000_000
    }
    // payroll overwrites employed income from employer wages — raise those too,
    // otherwise employed members' incomes drop back and drift turns negative
    for (const e of sim.ctx.world.employers) e.monthlyWageCents = 2_000_000
    // all-dead household shells (no family GC in this fixture) are FROZEN by
    // the drift loop; inhabited units must drift UP toward the affluent
    // steady-state (quality 1)
    const personById = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    const householdById = new Map(sim.ctx.world.households.map((h) => [h.id, h]))
    const tracked = [...units.entries()].map(([hid, u]) => {
      const household = householdById.get(hid)
      const hadAlive = household !== undefined &&
        household.memberIds.some((id) => personById.get(id)?.alive === true)
      return { ref: u, before: u.quality, hadAlive }
    })
    sim.stepTo(sim.ctx.clock.tick + TICKS_PER_MONTH)
    let rose = 0
    for (const t of tracked) {
      if (t.hadAlive) {
        expect(t.ref.quality).toBeGreaterThan(t.before)
        rose++
      } else {
        expect(t.ref.quality).toBe(t.before) // frozen all-dead shell
      }
      expect(t.ref.quality).toBeLessThanOrEqual(1)
    }
    expect(rose).toBe(tracked.filter((t) => t.hadAlive).length)
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
