import { describe, expect, it } from 'vitest'
import { ageYears } from '@genesis/core'
import { checkInvariants, demographicsSystem, Person, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

const SEED = 7
const YEARS = 2

/**
 * GEN-060: a father and his daughter who know each other (mutual
 * relationshipIds) and would marry almost surely under affinity = 1.0 must be
 * blocked by the close-kin filter. Seed 7 yields exactly one single male
 * 35-55 and one single female 20-30 (diagnosed), which become the pair.
 */
describe('close-kin marriage ban (GEN-060)', () => {
  it('a father and his daughter never marry despite maximal affinity', () => {
    const sim = Simulation.create(
      { seed: SEED, populationTarget: 120, years: YEARS },
      { systems: [demographicsSystem, familySystem({ affinity: () => 1.0, conflict: () => 0 })] }
    )
    const world = sim.ctx.world
    const age = (p: Person) => ageYears(p.birthTick, 0)
    const father = world.persons.find(
      (p) => p.alive && p.sex === 'male' && p.maritalStatus === 'single' && age(p) >= 35 && age(p) <= 55
    )
    const daughter = world.persons.find(
      (p) => p.alive && p.sex === 'female' && p.maritalStatus === 'single' && age(p) >= 20 && age(p) <= 30
    )
    expect(father).toBeDefined()
    expect(daughter).toBeDefined()
    expect(father!.id).not.toBe(daughter!.id)

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
