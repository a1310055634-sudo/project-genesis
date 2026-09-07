import { describe, expect, it } from 'vitest'
import { buildKinshipIndex, createPerson, createContext, createHousehold, normalizeConfig, Simulation } from '@genesis/simulation'
import { createRng, TICKS_PER_YEAR } from '@genesis/core'

function makeCtx(seed: number | string = 3) {
  const world = { seed: 1, persons: [], households: [], employers: [] }
  return createContext(normalizeConfig({ seed, populationTarget: 6, years: 1 }), world, createRng(seed))
}

describe('kinship index (Wave 3.2 contract)', () => {
  it('derives parent/child, sibling and grandparent relations', () => {
    const ctx = makeCtx()
    const father = createPerson(ctx, undefined, { sex: 'male', birthTick: -40 * TICKS_PER_YEAR })
    const mother = createPerson(ctx, undefined, { sex: 'female', birthTick: -38 * TICKS_PER_YEAR })
    const son = createPerson(ctx, undefined, { sex: 'male', birthTick: -10 * TICKS_PER_YEAR, parents: { motherId: mother.id, fatherId: father.id } })
    const daughter = createPerson(ctx, undefined, { sex: 'female', birthTick: -8 * TICKS_PER_YEAR, parents: { motherId: mother.id, fatherId: father.id } })
    const granddaughter = createPerson(ctx, undefined, {
      sex: 'female',
      birthTick: -1 * TICKS_PER_YEAR,
      parents: { motherId: daughter.id }
    })
    createHousehold(ctx, [father.id, mother.id, son.id, daughter.id, granddaughter.id])

    const kin = buildKinshipIndex(ctx.world)

    expect(kin.childrenOf(father.id).map((p) => p.id).sort()).toEqual([son.id, daughter.id].sort())
    expect(kin.siblingsOf(son.id).map((p) => p.id)).toEqual([daughter.id])
    expect(kin.parentsOf(son).map((p) => p.id).sort()).toEqual([father.id, mother.id].sort())
    // grandparent/grandchild counts as close kin
    expect(kin.isCloseKin(father, granddaughter)).toBe(true)
    expect(kin.isCloseKin(son, daughter)).toBe(true)
    expect(kin.isCloseKin(father, son)).toBe(true)
    expect(kin.isCloseKin(mother, son)).toBe(true)
    // unrelated strangers are not kin
    const stranger = createPerson(ctx, undefined, { sex: 'male', birthTick: -50 * TICKS_PER_YEAR })
    expect(kin.isCloseKin(stranger, son)).toBe(false)
    expect(kin.isCloseKin(father, father)).toBe(true)
  })

  it('integration: generated minors resolve to siblings via the index', () => {
    const sim = Simulation.create({ seed: 42, populationTarget: 200, years: 1 })
    const kin = buildKinshipIndex(sim.ctx.world)
    const persons = sim.ctx.world.persons
    const minors = persons.filter((p) => p.lifeStage === 'child' && p.motherId !== null)
    expect(minors.length).toBeGreaterThan(5)
    // find one minor with a sibling via shared mother
    const withSiblings = minors.filter((m) => kin.siblingsOf(m.id).length > 0)
    // statistically near-certain at 200 population; if this ever flakes, lower population spread
    expect(withSiblings.length).toBeGreaterThan(0)
  })
})
