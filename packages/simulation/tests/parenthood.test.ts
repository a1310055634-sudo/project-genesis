import { describe, expect, it } from 'vitest'
import { createRng, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'
import { checkInvariants, createHousehold, createPerson, createContext, demographicsSystem, normalizeConfig, Simulation } from '@genesis/simulation'

/**
 * Parenthood chain + birth eligibility (red team RT1-01).
 * Uses birthProbabilityPerMonth = 1 so eligible couples produce exactly one
 * birth per monthly run — fully deterministic, no probabilistic flakes.
 */
function makeCtx(seed: number | string = 1) {
  const world = { seed: 1, persons: [], households: [], employers: [] }
  const config = normalizeConfig({ seed, populationTarget: 6, years: 2, birthProbabilityPerMonth: 1 })
  return createContext(config, world, createRng(seed))
}

function couple(ctx: ReturnType<typeof makeCtx>, married: boolean) {
  const a = createPerson(ctx, undefined, { sex: 'male', birthTick: -30 * TICKS_PER_YEAR })
  const b = createPerson(ctx, undefined, { sex: 'female', birthTick: -28 * TICKS_PER_YEAR })
  createHousehold(ctx, [a.id, b.id])
  if (married) {
    a.partnerId = b.id
    b.partnerId = a.id
    a.maritalStatus = 'married'
    b.maritalStatus = 'married'
  }
  return { a, b }
}

function runMonths(ctx: ReturnType<typeof makeCtx>, months: number, startMonth = 1): void {
  for (let m = startMonth; m < startMonth + months; m++) {
    ctx.clock.setTick(m * TICKS_PER_MONTH)
    demographicsSystem.run(ctx)
  }
}

describe('birth eligibility (RT1-01)', () => {
  it('cohabiting non-married couples produce NO births', () => {
    const ctx = makeCtx(5)
    couple(ctx, false)
    const before = ctx.world.persons.length
    runMonths(ctx, 6)
    expect(ctx.world.persons.length).toBe(before)
  })

  it('married couples (p=1) produce one birth per month, newborns carry parents', () => {
    const ctx = makeCtx(7)
    const { a, b } = couple(ctx, true)
    const before = ctx.world.persons.length
    runMonths(ctx, 6)
    expect(ctx.world.persons.length - before).toBe(6)
    const newborn = ctx.world.persons[ctx.world.persons.length - 1]
    if (newborn === undefined) throw new Error('expected a newborn')
    expect(newborn.motherId).toBe(b.id)
    expect(newborn.fatherId).toBe(a.id)
    expect(newborn.lifeStage).toBe('child')
    // born payload records the parenthood chain
    const born = ctx.log.recentEvents().filter((e) => e.type === 'person.born')
    expect(born.length).toBeGreaterThanOrEqual(6)
    const last = born[born.length - 1]
    expect((last?.payload as { motherId?: string }).motherId).toBe(b.id)
    // invariants stay green across the whole chain
    const result = checkInvariants(ctx.world, ctx.clock.tick, 1)
    expect(result.violations).toBe(0)
  })

  it('generated minors carry parent links to adults in their household', () => {
    const sim = Simulation.create({ seed: 42, populationTarget: 200, years: 1 })
    const persons = sim.ctx.world.persons
    const byId = new Map(persons.map((p) => [p.id, p]))
    const minors = persons.filter((p) => p.lifeStage === 'child')
    expect(minors.length).toBeGreaterThan(0)
    for (const minor of minors) {
      const hasParent = minor.motherId !== null || minor.fatherId !== null
      expect(hasParent).toBe(true)
      for (const parentId of [minor.motherId, minor.fatherId]) {
        if (parentId === null) continue
        const parent = byId.get(parentId)
        expect(parent).toBeDefined()
        expect(parent!.birthTick).toBeLessThan(minor.birthTick)
      }
    }
  })
})
