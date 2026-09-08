import { describe, expect, it } from 'vitest'
import { TICKS_PER_YEAR } from '@genesis/core'
import { checkInvariants, demographicsSystem, Person, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

const SEED = 7
const YEARS = 2

/**
 * GEN-060: a father and his daughter who know each other (mutual
 * relationshipIds) and would marry almost surely under affinity = 1.0 must be
 * blocked by the close-kin filter.
 *
 * The pair is ENGINEERED from any alive male/female (ages rewritten, partner
 * and parenthood links normalized) so the test is independent of what a given
 * seed's generation happened to draw — config-hash shifts must not break it.
 */
describe('close-kin marriage ban (GEN-060)', () => {
  it('a father and his daughter never marry despite maximal affinity', () => {
    const sim = Simulation.create(
      { seed: SEED, populationTarget: 120, years: YEARS },
      { systems: [demographicsSystem, familySystem({ affinity: () => 1.0, conflict: () => 0 })] }
    )
    const world = sim.ctx.world
    const father = world.persons.find((p) => p.alive && p.sex === 'male')
    const daughter = world.persons.find((p) => p.alive && p.sex === 'female' && p.id !== father?.id)
    expect(father).toBeDefined()
    expect(daughter).toBeDefined()

    // engineer: father 40, daughter 25, both single, no other family ties
    for (const person of world.persons) {
      // sever any generated parenthood link pointing at the pair
      if (person.motherId === father!.id || person.motherId === daughter!.id) person.motherId = null
      if (person.fatherId === father!.id || person.fatherId === daughter!.id) person.fatherId = null
    }
    for (const person of [father as Person, daughter as Person]) {
      if (person.partnerId !== null) {
        const partner = world.persons.find((p) => p.id === person.partnerId)
        if (partner !== undefined) {
          partner.partnerId = null
          partner.maritalStatus = 'single'
        }
      }
      person.partnerId = null
      person.maritalStatus = 'single'
      person.motherId = null
      person.fatherId = null
    }
    father!.birthTick = -40 * TICKS_PER_YEAR
    daughter!.birthTick = -25 * TICKS_PER_YEAR
    father!.lifeStage = 'adult'
    daughter!.lifeStage = 'adult'

    // parenthood (father strictly older — required by parent-older-than-child)
    // + mutual friendship: without the kinship filter this pair would marry
    // with near-certainty under affinity = 1.0 (p ~ 0.36 per month)
    daughter!.fatherId = father!.id
    father!.social.relationshipIds = [daughter!.id]
    daughter!.social.relationshipIds = [father!.id]

    sim.run()

    // the pair survived the run, so the empty result is meaningful
    expect(father!.alive).toBe(true)
    expect(daughter!.alive).toBe(true)
    expect(sim.ctx.log.countOf('marriage.created')).toBe(0)
    expect(father!.maritalStatus).not.toBe('married')
    expect(daughter!.maritalStatus).not.toBe('married')
    expect(father!.partnerId).toBeNull()
    expect(daughter!.partnerId).toBeNull()

    const stats = checkInvariants(world, sim.ctx.clock.tick, world.seed)
    expect(stats.violations).toBe(0)
  }, 120_000)

  it('an uncle never marries his niece (kinship v2 avunculate ban, RT2-07)', () => {
    const sim = Simulation.create(
      { seed: SEED, populationTarget: 120, years: YEARS },
      { systems: [demographicsSystem, familySystem({ affinity: () => 1.0, conflict: () => 0 })] }
    )
    const world = sim.ctx.world
    // four distinct residents rewritten into a three-generation chain:
    // grandfather GF -> two sons (uncle U, father F) -> niece N (F's daughter)
    const uncle = world.persons.find((p) => p.alive && p.sex === 'male')
    const father = world.persons.find((p) => p.alive && p.sex === 'male' && p.id !== uncle?.id)
    const grandfather = world.persons.find((p) => p.alive && p.sex === 'male' && p.id !== uncle?.id && p.id !== father?.id)
    const niece = world.persons.find(
      (p) => p.alive && p.sex === 'female' && p.id !== uncle?.id && p.id !== father?.id && p.id !== grandfather?.id
    )
    expect(uncle).toBeDefined()
    expect(father).toBeDefined()
    expect(grandfather).toBeDefined()
    expect(niece).toBeDefined()
    const cast = [uncle as Person, father as Person, grandfather as Person, niece as Person]
    const castIds = new Set(cast.map((p) => p.id))

    // engineer the chain: sever every generated link touching the cast so the
    // only kinship between U and N is the avunculate path U <- GF -> F -> N
    for (const person of world.persons) {
      if (
        (person.motherId !== null && castIds.has(person.motherId)) ||
        (person.fatherId !== null && castIds.has(person.fatherId))
      ) {
        person.motherId = null
        person.fatherId = null
      }
    }
    for (const person of cast) {
      if (person.partnerId !== null) {
        const partner = world.persons.find((p) => p.id === person.partnerId)
        if (partner !== undefined) {
          partner.partnerId = null
          partner.maritalStatus = 'single'
        }
      }
      person.partnerId = null
      person.maritalStatus = 'single'
      person.motherId = null
      person.fatherId = null
    }
    grandfather!.fatherId = null
    uncle!.fatherId = grandfather!.id
    father!.fatherId = grandfather!.id
    niece!.fatherId = father!.id
    // parent-older-than-child holds strictly down the chain; N is inside the
    // marriage age window, U is her uncle through the shared grandfather only
    grandfather!.birthTick = -70 * TICKS_PER_YEAR
    grandfather!.lifeStage = 'senior'
    uncle!.birthTick = -45 * TICKS_PER_YEAR
    father!.birthTick = -40 * TICKS_PER_YEAR
    niece!.birthTick = -22 * TICKS_PER_YEAR
    for (const person of [uncle as Person, father as Person, niece as Person]) person.lifeStage = 'adult'

    // mutual friendship: without the v2 kinship filter this pair would marry
    // with near-certainty under affinity = 1.0 (p ~ 0.36 per month)
    uncle!.social.relationshipIds = [niece!.id]
    niece!.social.relationshipIds = [uncle!.id]

    sim.run()

    // the pair survived the run, so the empty result is meaningful
    expect(uncle!.alive).toBe(true)
    expect(niece!.alive).toBe(true)
    expect(sim.ctx.log.countOf('marriage.created')).toBe(0)
    expect(uncle!.maritalStatus).not.toBe('married')
    expect(niece!.maritalStatus).not.toBe('married')
    expect(uncle!.partnerId).toBeNull()
    expect(niece!.partnerId).toBeNull()

    const stats = checkInvariants(world, sim.ctx.clock.tick, world.seed)
    expect(stats.violations).toBe(0)
  }, 120_000)
})
