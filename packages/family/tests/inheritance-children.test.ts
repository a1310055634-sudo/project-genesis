import { describe, expect, it } from 'vitest'
import { createRng, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'
import { createHousehold, createPerson, createContext, normalizeConfig } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

/**
 * Estate distribution with the parenthood chain (RT1-01):
 * spouse 50% + children split the rest; spouse takes all only childless;
 * children-only estates split fully. Conservation must hold to the cent.
 */
function makeCtx(seed: number | string = 9) {
  const world = { seed: 1, persons: [], households: [], employers: [] }
  const config = normalizeConfig({ seed, populationTarget: 6, years: 1 })
  return createContext(config, world, createRng(seed))
}

function kill(ctx: ReturnType<typeof makeCtx>, personId: string): void {
  const person = ctx.world.persons.find((p) => p.id === personId)
  if (person === undefined) throw new Error('fixture person missing')
  person.alive = false
  person.deathTick = ctx.clock.tick
  if (person.householdId !== null) {
    const household = ctx.world.households.find((h) => h.id === person.householdId)
    if (household !== undefined) household.memberIds = household.memberIds.filter((id) => id !== personId)
    person.householdId = null
  }
}

function totalWealth(ctx: ReturnType<typeof makeCtx>): number {
  return ctx.world.persons.reduce((sum, p) => sum + p.economy.wealthCents, 0)
}

const ESTATE = 100_001 // odd: forces a real floor on the 50% spouse share

describe('children inheritance (RT1-01)', () => {
  it('estate with children only: children split the whole estate', () => {
    const ctx = makeCtx(9)
    const father = createPerson(ctx, undefined, { sex: 'male', birthTick: -40 * TICKS_PER_YEAR })
    const child1 = createPerson(ctx, undefined, { sex: 'female', birthTick: -10 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    const child2 = createPerson(ctx, undefined, { sex: 'male', birthTick: -8 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    createHousehold(ctx, [father.id, child1.id, child2.id])
    father.economy.wealthCents = ESTATE
    kill(ctx, father.id)
    ctx.clock.setTick(TICKS_PER_MONTH)
    familySystem().run(ctx)

    expect(father.economy.wealthCents).toBe(0)
    expect(child1.economy.wealthCents + child2.economy.wealthCents).toBe(ESTATE)
    const inherited = ctx.log.recentEvents().filter((e) => e.type === 'wealth.inherited')
    expect(inherited.length).toBe(2)
    expect(totalWealth(ctx)).toBe(ESTATE)
  })

  it('estate with spouse and child: spouse 50% (floor), child the remainder', () => {
    const ctx = makeCtx(10)
    const father = createPerson(ctx, undefined, { sex: 'male', birthTick: -40 * TICKS_PER_YEAR })
    const mother = createPerson(ctx, undefined, { sex: 'female', birthTick: -38 * TICKS_PER_YEAR })
    const child = createPerson(ctx, undefined, { sex: 'female', birthTick: -10 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    createHousehold(ctx, [father.id, mother.id, child.id])
    father.partnerId = mother.id
    mother.partnerId = father.id
    father.maritalStatus = 'married'
    mother.maritalStatus = 'married'
    father.economy.wealthCents = ESTATE
    kill(ctx, father.id)
    ctx.clock.setTick(TICKS_PER_MONTH)
    familySystem().run(ctx)

    expect(mother.economy.wealthCents).toBe(Math.floor(ESTATE / 2))
    expect(child.economy.wealthCents).toBe(ESTATE - Math.floor(ESTATE / 2))
    expect(totalWealth(ctx)).toBe(ESTATE)
    const relations = ctx.log
      .recentEvents()
      .filter((e) => e.type === 'wealth.inherited')
      .map((e) => (e.payload as { relation: string }).relation)
    expect(relations).toContain('spouse')
    expect(relations).toContain('child')
  })
})
