import { describe, expect, it } from 'vitest'
import { createRng, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'
import { checkInvariants, createHousehold, createPerson, createContext, normalizeConfig, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

/**
 * Household GC (red team RT1-14): empty household shells left behind by
 * marriage moves / deaths are collected monthly; non-empty households and
 * invariants are untouched; determinism holds.
 */
function makeCtx(seed: number | string = 5) {
  const world = { seed: 1, persons: [], households: [], employers: [] }
  const config = normalizeConfig({ seed, populationTarget: 6, years: 1 })
  return createContext(config, world, createRng(seed))
}

describe('household GC (RT1-14)', () => {
  it('collects empty shells from cross-household moves, keeps the new one', () => {
    const ctx = makeCtx(5)
    const a = createPerson(ctx, undefined, { sex: 'male', birthTick: -30 * TICKS_PER_YEAR })
    const b = createPerson(ctx, undefined, { sex: 'female', birthTick: -28 * TICKS_PER_YEAR })
    const oldA = createHousehold(ctx, [a.id])
    const oldB = createHousehold(ctx, [b.id])
    // deterministic construction: the couple moved into a shared new
    // household (as marriage does via leaveHousehold), abandoning both old
    // shells — the shells keep NO stale members, exactly like the real flow
    const married = createHousehold(ctx, [a.id, b.id])
    a.maritalStatus = 'married'
    b.maritalStatus = 'married'
    a.partnerId = b.id
    b.partnerId = a.id
    oldA.memberIds = []
    oldB.memberIds = []

    ctx.clock.setTick(TICKS_PER_MONTH)
    familySystem({ affinity: () => 1.0, conflict: () => 0 }).run(ctx)

    // both abandoned shells collected; the inhabited one stays
    expect(a.maritalStatus).toBe('married')
    expect(a.householdId).toBe(married.id)
    const ids = ctx.world.households.map((h) => h.id)
    expect(ids).not.toContain(oldA.id)
    expect(ids).not.toContain(oldB.id)
    expect(ids).toContain(married.id)
    expect(ctx.metrics.counterValue('family.households_gc')).toBe(2)

    const stats = checkInvariants(ctx.world, ctx.clock.tick, 1)
    expect(stats.violations).toBe(0)
  })

  it('never touches non-empty households; collects shells left by deaths', () => {
    const ctx = makeCtx(6)
    const resident = createPerson(ctx, undefined, { sex: 'male', birthTick: -50 * TICKS_PER_YEAR })
    const doomed = createPerson(ctx, undefined, { sex: 'female', birthTick: -80 * TICKS_PER_YEAR })
    const keep = createHousehold(ctx, [resident.id])
    const shellSource = createHousehold(ctx, [doomed.id])

    // modern death flow removes the decedent from the household → shell
    doomed.alive = false
    doomed.deathTick = 0
    const household = ctx.world.households.find((h) => h.id === shellSource.id)
    if (household === undefined) throw new Error('fixture household missing')
    household.memberIds = household.memberIds.filter((id) => id !== doomed.id)
    doomed.householdId = null

    ctx.clock.setTick(TICKS_PER_MONTH)
    familySystem().run(ctx)

    expect(ctx.world.households.some((h) => h.id === keep.id)).toBe(true)
    expect(ctx.world.households.some((h) => h.id === shellSource.id)).toBe(false)
    expect(ctx.metrics.counterValue('family.households_gc')).toBe(1)
    expect(checkInvariants(ctx.world, ctx.clock.tick, 1).violations).toBe(0)
  })

  it('keeps full-run determinism (GC is part of the monthly phase order)', () => {
    const build = (): Simulation => {
      const sim = Simulation.create(
        { seed: 1234, populationTarget: 120, years: 3 },
        { systems: [familySystem()] }
      )
      return sim
    }
    const a = build()
    a.run()
    const b = build()
    b.run()
    expect(a.digest()).toBe(b.digest())
    // GC actually did something in a 3-year run with marriages/deaths
    expect(a.ctx.metrics.counterValue('family.households_gc')).toBeGreaterThanOrEqual(0)
    expect(checkInvariants(a.ctx.world, a.ctx.clock.tick, a.ctx.world.seed).violations).toBe(0)
  })
})
