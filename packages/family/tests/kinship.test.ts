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
})
