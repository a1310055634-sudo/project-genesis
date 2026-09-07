import { describe, expect, it } from 'vitest'
import { ageYears, TICKS_PER_YEAR } from '@genesis/core'
import { checkInvariants, demographicsSystem, Person, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

const SEED = 11
const YEARS = 2
const PAIRS = 10

/**
 * Scenario 3: affinity pinned to 1.0 (p_marry = 0.14 per attempt, 3 attempts
 * per month) makes engineered friend pairs marry within a couple of years.
 * conflict pinned to 0 keeps the floor hazard (0.0005) negligible.
 */
describe('marriage', () => {
  it('friends with maximal affinity marry, merge households and satisfy invariants', () => {
    const sim = Simulation.create(
      { seed: SEED, populationTarget: 200, years: YEARS },
      { systems: [demographicsSystem, familySystem({ affinity: () => 1.0, conflict: () => 0 })] }
    )

    // Engineer PAIRS opposite-sex single friends aged 20..55 (stays inside the
    // eligibility window for the whole run). Singles never had a partner, so
    // no stale pointers need cleanup.
    const eligible = (sex: 'male' | 'female'): Person[] =>
      sim.ctx.world.persons.filter(
        (p) => p.alive && p.sex === sex && p.maritalStatus === 'single' && ageYears(p.birthTick, 0) >= 20 && ageYears(p.birthTick, 0) <= 55
      )
    const males = eligible('male')
    const females = eligible('female')
    const pairCount = Math.min(PAIRS, males.length, females.length)
    // the generator's greedy pairing leaves skewed singles pools per seed;
    // seed 11 yields 5 eligible opposite-sex singles on the short side — with
    // p(marry) ≈ 0.36/month/pair over 11 monthly runs, at least one marriage
    // is deterministic-practically-certain
    expect(pairCount).toBeGreaterThanOrEqual(5) // enough parallel courtships

    const pairs: Array<[Person, Person]> = []
    for (let i = 0; i < pairCount; i++) {
      const a = males[i] as Person
      const b = females[i] as Person
      a.social.relationshipIds = [b.id]
      b.social.relationshipIds = [a.id]
      pairs.push([a, b])
    }

    sim.run()

    expect(sim.ctx.log.countOf('marriage.created')).toBeGreaterThan(0)

    const byId = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    const marriedPairs = pairs.filter(([a, b]) => {
      const pa = byId.get(a.id) as Person
      const pb = byId.get(b.id) as Person
      return pa.maritalStatus === 'married' && pb.maritalStatus === 'married' && pa.partnerId === pb.id && pb.partnerId === pa.id
    })
    expect(marriedPairs.length).toBeGreaterThan(0)

    // every surviving marriage is cohabiting: one shared, real household
    for (const [a, b] of marriedPairs) {
      const pa = byId.get(a.id) as Person
      const pb = byId.get(b.id) as Person
      expect(pa.householdId).not.toBeNull()
      expect(pa.householdId).toBe(pb.householdId)
      const household = sim.ctx.world.households.find((h) => h.id === pa.householdId)
      expect(household).toBeDefined()
      expect(household!.memberIds).toContain(a.id)
      expect(household!.memberIds).toContain(b.id)
    }

    const stats = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
    expect(stats.violations).toBe(0)
  }, 120_000)
})
