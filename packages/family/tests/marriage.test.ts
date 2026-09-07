import { describe, expect, it } from 'vitest'
import { TICKS_PER_YEAR } from '@genesis/core'
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

    // Engineer PAIRS of opposite-sex singles aged 20..55 from ANY alive
    // persons (ages rewritten, partner/parenthood links normalized) so the
    // fixture is independent of what a given seed's generation drew. Ages
    // 25+i stay inside the eligibility window for the whole 2-year run.
    const males = sim.ctx.world.persons.filter((p) => p.alive && p.sex === 'male')
    const females = sim.ctx.world.persons.filter((p) => p.alive && p.sex === 'female')
    const pairCount = Math.min(PAIRS, males.length, females.length)
    // 200 residents at ~50/50 sex split makes 5 pairs deterministic-practically-certain
    expect(pairCount).toBeGreaterThanOrEqual(5)

    const pairs: Array<[Person, Person]> = []
    for (let i = 0; i < pairCount; i++) {
      const a = males[i] as Person
      const b = females[i] as Person
      // normalize both sides: single, no stale partner pointers, no parenthood
      // links that the age rewrite could invalidate
      for (const person of [a, b]) {
        if (person.partnerId !== null) {
          const partner = sim.ctx.world.persons.find((p) => p.id === person.partnerId)
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
      for (const other of sim.ctx.world.persons) {
        if (other.motherId === a.id || other.motherId === b.id) other.motherId = null
        if (other.fatherId === a.id || other.fatherId === b.id) other.fatherId = null
      }
      a.birthTick = -(25 + i) * TICKS_PER_YEAR
      b.birthTick = -(24 + i) * TICKS_PER_YEAR
      a.lifeStage = 'adult'
      b.lifeStage = 'adult'
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
