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

  it('widow side: a widow is close kin to her late husband brother-in-law (RT3-01)', () => {
    const ctx = makeCtx()
    // two brothers via a shared father (areSiblings needs a common parent)
    const father = createPerson(ctx, undefined, { sex: 'male', birthTick: -60 * TICKS_PER_YEAR })
    const husband = createPerson(ctx, undefined, { sex: 'male', birthTick: -40 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    const brother = createPerson(ctx, undefined, { sex: 'male', birthTick: -38 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    const widow = createPerson(ctx, undefined, { sex: 'female', birthTick: -38 * TICKS_PER_YEAR })
    // husband dies: death-time snapshot written on the DECEASED (demographics flow)
    husband.alive = false
    husband.deathTick = 0
    husband.spouseAtDeathId = widow.id
    const kin = buildKinshipIndex(ctx.world)
    // the LIVING widow must resolve affinity through the reverse map — this is
    // the production query pair (two living people), unlike the dead-side case
    expect(kin.isCloseKin(widow, brother)).toBe(true)
    expect(kin.isCloseKin(brother, widow)).toBe(true)
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

describe('kinship index v2 (Wave 3.3: blood depth 2 + first-degree affinity)', () => {
  it('flags avunculate: an uncle and his niece are close kin', () => {
    const ctx = makeCtx()
    const grandfather = createPerson(ctx, undefined, { sex: 'male', birthTick: -70 * TICKS_PER_YEAR })
    const uncle = createPerson(ctx, undefined, { sex: 'male', birthTick: -45 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const father = createPerson(ctx, undefined, { sex: 'male', birthTick: -40 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const niece = createPerson(ctx, undefined, { sex: 'female', birthTick: -22 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    const kin = buildKinshipIndex(ctx.world)

    expect(kin.isCloseKin(uncle, niece)).toBe(true)
    expect(kin.isCloseKin(niece, uncle)).toBe(true)
    // the shared grandfather stays v1-close to the niece (sanity anchor)
    expect(kin.isCloseKin(grandfather, niece)).toBe(true)
    // the two brothers stay v1-close (siblings)
    expect(kin.isCloseKin(uncle, father)).toBe(true)
  })

  it('flags first cousins whose parents are siblings', () => {
    const ctx = makeCtx()
    const grandfather = createPerson(ctx, undefined, { sex: 'male', birthTick: -70 * TICKS_PER_YEAR })
    const parentA = createPerson(ctx, undefined, { sex: 'male', birthTick: -45 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const parentB = createPerson(ctx, undefined, { sex: 'female', birthTick: -43 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const cousinA = createPerson(ctx, undefined, { sex: 'male', birthTick: -20 * TICKS_PER_YEAR, parents: { fatherId: parentA.id } })
    const cousinB = createPerson(ctx, undefined, { sex: 'female', birthTick: -19 * TICKS_PER_YEAR, parents: { motherId: parentB.id } })
    const kin = buildKinshipIndex(ctx.world)

    expect(kin.isCloseKin(cousinA, cousinB)).toBe(true)
    expect(kin.isCloseKin(cousinB, cousinA)).toBe(true)
  })

  it('flags parents-in-law and their mirror (child-in-law) over the living spouse edge', () => {
    const ctx = makeCtx()
    const fatherInLaw = createPerson(ctx, undefined, { sex: 'male', birthTick: -55 * TICKS_PER_YEAR })
    const bride = createPerson(ctx, undefined, { sex: 'female', birthTick: -28 * TICKS_PER_YEAR, parents: { fatherId: fatherInLaw.id } })
    const groom = createPerson(ctx, undefined, { sex: 'male', birthTick: -30 * TICKS_PER_YEAR })
    groom.partnerId = bride.id
    bride.partnerId = groom.id
    const kin = buildKinshipIndex(ctx.world)

    // the groom vs the spouse's father = father-in-law
    expect(kin.isCloseKin(groom, fatherInLaw)).toBe(true)
    // mirror: the bridegroom is the father's child-in-law
    expect(kin.isCloseKin(fatherInLaw, groom)).toBe(true)
    // the bride keeps her own v1 blood tie to her father
    expect(kin.isCloseKin(bride, fatherInLaw)).toBe(true)
  })

  it('flags a sibling-spouse pair (levirate-style step-kin) in both directions', () => {
    const ctx = makeCtx()
    const sharedFather = createPerson(ctx, undefined, { sex: 'male', birthTick: -60 * TICKS_PER_YEAR })
    const brother = createPerson(ctx, undefined, { sex: 'male', birthTick: -32 * TICKS_PER_YEAR, parents: { fatherId: sharedFather.id } })
    const sister = createPerson(ctx, undefined, { sex: 'female', birthTick: -30 * TICKS_PER_YEAR, parents: { fatherId: sharedFather.id } })
    const sistersHusband = createPerson(ctx, undefined, { sex: 'male', birthTick: -31 * TICKS_PER_YEAR })
    sister.partnerId = sistersHusband.id
    sistersHusband.partnerId = sister.id
    const kin = buildKinshipIndex(ctx.world)

    expect(kin.isCloseKin(brother, sistersHusband)).toBe(true)
    expect(kin.isCloseKin(sistersHusband, brother)).toBe(true)
    // the blood sibling pair is close for the v1 reason
    expect(kin.isCloseKin(brother, sister)).toBe(true)
  })

  it('flags a spouse sibling in both directions, alive or via the death-time snapshot', () => {
    const ctx = makeCtx()
    const sharedFather = createPerson(ctx, undefined, { sex: 'male', birthTick: -60 * TICKS_PER_YEAR })
    const husband = createPerson(ctx, undefined, { sex: 'male', birthTick: -30 * TICKS_PER_YEAR })
    const wife = createPerson(ctx, undefined, { sex: 'female', birthTick: -28 * TICKS_PER_YEAR, parents: { fatherId: sharedFather.id } })
    const brotherInLaw = createPerson(ctx, undefined, { sex: 'male', birthTick: -26 * TICKS_PER_YEAR, parents: { fatherId: sharedFather.id } })
    husband.partnerId = wife.id
    wife.partnerId = husband.id
    const kin = buildKinshipIndex(ctx.world)

    expect(kin.isCloseKin(husband, brotherInLaw)).toBe(true)
    expect(kin.isCloseKin(brotherInLaw, husband)).toBe(true)

    // the SAME relation survives the death of the husband: the
    // spouseAtDeathId snapshot anchors the in-law edge after partnerId clears
    husband.alive = false
    husband.deathTick = 0
    husband.spouseAtDeathId = wife.id
    husband.partnerId = null
    wife.partnerId = null
    wife.maritalStatus = 'widowed'
    const kinAfterDeath = buildKinshipIndex(ctx.world)
    expect(kinAfterDeath.isCloseKin(husband, brotherInLaw)).toBe(true)
    expect(kinAfterDeath.isCloseKin(brotherInLaw, husband)).toBe(true)
  })

  it('flags a step-parent and its mirror (the spouse of the other parent)', () => {
    const ctx = makeCtx()
    const mother = createPerson(ctx, undefined, { sex: 'female', birthTick: -50 * TICKS_PER_YEAR })
    const stepFather = createPerson(ctx, undefined, { sex: 'male', birthTick: -52 * TICKS_PER_YEAR })
    const child = createPerson(ctx, undefined, { sex: 'male', birthTick: -25 * TICKS_PER_YEAR, parents: { motherId: mother.id } })
    mother.partnerId = stepFather.id
    stepFather.partnerId = mother.id
    const kin = buildKinshipIndex(ctx.world)

    expect(kin.isCloseKin(child, stepFather)).toBe(true)
    expect(kin.isCloseKin(stepFather, child)).toBe(true)
  })

  it('still allows relations beyond the v2 depth boundary (recorded simplification)', () => {
    const ctx = makeCtx()
    // spouse sibling spouse: ego married the wife; the wife's sister married
    // another man - that man is two affinity hops away from ego
    const sharedFather = createPerson(ctx, undefined, { sex: 'male', birthTick: -60 * TICKS_PER_YEAR })
    const ego = createPerson(ctx, undefined, { sex: 'male', birthTick: -30 * TICKS_PER_YEAR })
    const wife = createPerson(ctx, undefined, { sex: 'female', birthTick: -28 * TICKS_PER_YEAR, parents: { fatherId: sharedFather.id } })
    const wifeSibling = createPerson(ctx, undefined, { sex: 'female', birthTick: -26 * TICKS_PER_YEAR, parents: { fatherId: sharedFather.id } })
    const wifeSiblingSpouse = createPerson(ctx, undefined, { sex: 'male', birthTick: -29 * TICKS_PER_YEAR })
    ego.partnerId = wife.id
    wife.partnerId = ego.id
    wifeSibling.partnerId = wifeSiblingSpouse.id
    wifeSiblingSpouse.partnerId = wifeSibling.id

    // uncle wife: grandfather has three sons (uncle, father, third brother);
    // the uncle married - his wife is no kin of the niece
    const grandfather = createPerson(ctx, undefined, { sex: 'male', birthTick: -80 * TICKS_PER_YEAR })
    const uncle = createPerson(ctx, undefined, { sex: 'male', birthTick: -50 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const father = createPerson(ctx, undefined, { sex: 'male', birthTick: -45 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const thirdBrother = createPerson(ctx, undefined, { sex: 'male', birthTick: -47 * TICKS_PER_YEAR, parents: { fatherId: grandfather.id } })
    const niece = createPerson(ctx, undefined, { sex: 'female', birthTick: -22 * TICKS_PER_YEAR, parents: { fatherId: father.id } })
    const auntByMarriage = createPerson(ctx, undefined, { sex: 'female', birthTick: -48 * TICKS_PER_YEAR })
    uncle.partnerId = auntByMarriage.id
    auntByMarriage.partnerId = uncle.id
    // cousins via the third brother, plus that cousin's child
    const cousin = createPerson(ctx, undefined, { sex: 'female', birthTick: -21 * TICKS_PER_YEAR, parents: { fatherId: thirdBrother.id } })
    const cousinsChild = createPerson(ctx, undefined, { sex: 'male', birthTick: -2 * TICKS_PER_YEAR, parents: { motherId: cousin.id } })
    // a fourth generation on top makes the grandfather a great-grandparent
    const greatGrandparent = createPerson(ctx, undefined, { sex: 'male', birthTick: -95 * TICKS_PER_YEAR })
    grandfather.fatherId = greatGrandparent.id

    const kin = buildKinshipIndex(ctx.world)
    // sanity anchors: the one-hop relations themselves ARE banned
    expect(kin.isCloseKin(ego, wifeSibling)).toBe(true)
    expect(kin.isCloseKin(niece, uncle)).toBe(true)
    expect(kin.isCloseKin(niece, cousin)).toBe(true)

    // beyond the v2 boundary: all still allowed
    expect(kin.isCloseKin(ego, wifeSiblingSpouse)).toBe(false)
    expect(kin.isCloseKin(wifeSiblingSpouse, ego)).toBe(false)
    expect(kin.isCloseKin(niece, auntByMarriage)).toBe(false)
    expect(kin.isCloseKin(auntByMarriage, niece)).toBe(false)
    // great-avunculate: the cousins child vs its great-uncle (father brother)
    expect(kin.isCloseKin(cousinsChild, father)).toBe(false)
    expect(kin.isCloseKin(father, cousinsChild)).toBe(false)
    // great-grandparent / great-grandchild
    expect(kin.isCloseKin(greatGrandparent, niece)).toBe(false)
    expect(kin.isCloseKin(niece, greatGrandparent)).toBe(false)
    expect(kin.isCloseKin(greatGrandparent, cousinsChild)).toBe(false)
  })
})
