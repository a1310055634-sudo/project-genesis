import { describe, expect, it } from 'vitest'
import { SimulationEvent } from '@genesis/core'
import { checkInvariants, demographicsSystem, Person, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'
import { addPerson, makeMinor } from './helpers'

const SEED = 42
const YEARS = 2

/**
 * Scenario 4: conflict pinned to 1.0 gives p_divorce = 0.0205 per couple per
 * month — across the ~30 generated couples and 24 months, at least one divorce
 * is practically certain (and, being seeded, fully deterministic). No social
 * system runs, so relationshipIds stay empty and nobody remarries: after a
 * divorce both parties stay 'divorced' with partnerId = null.
 */
describe('divorce', () => {
  it('high-conflict couples divorce, the larger id moves out, invariants hold', () => {
    const sim = Simulation.create(
      { seed: SEED, populationTarget: 200, years: YEARS },
      { systems: [demographicsSystem, familySystem({ conflict: () => 1.0 })] }
    )

    const divorcedCouples: Array<[string, string]> = []
    sim.ctx.events.onAny((event: SimulationEvent) => {
      if (event.type === 'relationship.ended' && (event.payload as { reason?: string }).reason === 'divorce') {
        divorcedCouples.push([event.actorIds[0] as string, event.actorIds[1] as string])
      }
    })

    sim.run()

    expect(divorcedCouples.length).toBeGreaterThan(0)
    expect(sim.ctx.metrics.counterValue('family.divorces')).toBe(divorcedCouples.length)

    const byId = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    // at least one divorced couple must still show the canonical post-divorce
    // state at the end of the run (later deaths can null a mover's household)
    const cleanEndStates = divorcedCouples.filter(([aId, bId]) => {
      const a = byId.get(aId) as Person
      const b = byId.get(bId) as Person
      return (
        a.maritalStatus === 'divorced' &&
        b.maritalStatus === 'divorced' &&
        a.partnerId === null &&
        b.partnerId === null
      )
    })
    expect(cleanEndStates.length).toBeGreaterThan(0)

    // the lexicographically larger id moved into a NEW household (custody
    // followers — minors — may share it; every extra member must be a child)
    const movedOut = cleanEndStates.filter(([aId, bId]) => {
      const moverId = [aId, bId].sort()[1] as string
      const stayerId = moverId === aId ? bId : aId
      const mover = byId.get(moverId) as Person
      const stayer = byId.get(stayerId) as Person
      if (mover.householdId === null || mover.householdId === stayer.householdId) return false
      const household = sim.ctx.world.households.find((h) => h.id === mover.householdId)
      if (household === undefined || !household.memberIds.includes(mover.id)) return false
      return household.memberIds.every((id) => id === mover.id || byId.get(id)!.lifeStage === 'child')
    })
    expect(movedOut.length).toBeGreaterThan(0)

    const stats = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
    expect(stats.violations).toBe(0)
  }, 120_000)

  it('minors follow their mother into her new household on divorce (GEN-074 v1)', () => {
    const sim = Simulation.create(
      { seed: SEED, populationTarget: 200, years: YEARS },
      { systems: [demographicsSystem, familySystem({ conflict: () => 1.0 })] }
    )
    const world = sim.ctx.world
    const byId = new Map(world.persons.map((p) => [p.id, p]))

    // engineer intact families: married couple + 2 hand-built minors, in a
    // household without pre-existing minors (keeps childrenMoved exactly 2).
    // The mother is always the lexicographically larger-id spouse — the divorce
    // mover — so the children must relocate into her new household.
    interface Family {
      motherId: string
      fatherId: string
      childIds: string[]
    }
    const families: Family[] = []
    const couples = world.persons.filter((p) => p.alive && p.maritalStatus === 'married' && p.partnerId !== null)
    const consumed = new Set<string>()
    for (const person of couples) {
      if (families.length >= 12) break
      if (consumed.has(person.id)) continue
      const spouse = byId.get(person.partnerId as string)
      if (spouse === undefined || !spouse.alive) continue
      const household = world.households.find((h) => h.id === person.householdId)
      if (household === undefined) continue
      if (household.memberIds.some((id) => byId.get(id)!.lifeStage === 'child')) continue
      consumed.add(person.id)
      consumed.add(spouse.id)
      const [mother, father] = person.id > spouse.id ? [person, spouse] : [spouse, person]
      const children = [
        makeMinor(`test-child-${families.length}-a`, mother.id, father.id, 'female'),
        makeMinor(`test-child-${families.length}-b`, mother.id, father.id, 'male')
      ]
      for (const child of children) addPerson(sim, child, household.id)
      families.push({ motherId: mother.id, fatherId: father.id, childIds: children.map((c) => c.id) })
    }
    expect(families.length).toBeGreaterThanOrEqual(8)
    // rebuild the id index — the hand-built children joined the world above
    const liveById = new Map(world.persons.map((p) => [p.id, p]))

    // custody outcomes captured at divorce time (robust to later deaths)
    interface Outcome {
      childIds: string[]
      childrenMoved: number
      motherStatus: string
      motherHouseholdId: string | null
      motherHouseholdMembers: string[]
      childHouseholds: Array<string | null>
    }
    const outcomes = new Map<string, Outcome>() // keyed by motherId
    sim.ctx.events.onAny((event: SimulationEvent) => {
      if (event.type !== 'relationship.ended' || (event.payload as { reason?: string }).reason !== 'divorce') return
      const family = families.find((f) => event.actorIds.includes(f.motherId) && event.actorIds.includes(f.fatherId))
      if (family === undefined) return
      const mother = liveById.get(family.motherId) as Person
      const children = family.childIds.map((id) => liveById.get(id) as Person)
      if (!children.every((c) => c.alive)) return // mortality hit this family — skip
      const custodyHousehold = world.households.find((h) => h.id === mother.householdId)
      outcomes.set(family.motherId, {
        childIds: [...family.childIds],
        childrenMoved: (event.payload as { childrenMoved: number }).childrenMoved,
        motherStatus: mother.maritalStatus,
        motherHouseholdId: mother.householdId,
        motherHouseholdMembers: custodyHousehold !== undefined ? [...custodyHousehold.memberIds] : [],
        childHouseholds: children.map((c) => c.householdId)
      })
    })

    sim.run()

    expect(outcomes.size).toBeGreaterThan(0)
    for (const [motherId, outcome] of outcomes) {
      expect(outcome.childrenMoved).toBe(2)
      expect(outcome.motherStatus).toBe('divorced')
      expect(outcome.motherHouseholdId).not.toBeNull()
      // every child cohabits with the mother in her new household
      for (const householdId of outcome.childHouseholds) {
        expect(householdId).toBe(outcome.motherHouseholdId)
      }
      // the custody household holds the mother + exactly her moved children
      expect(outcome.motherHouseholdMembers).toEqual(
        expect.arrayContaining([motherId, ...outcome.childIds])
      )
      // the ex-husband must NOT live in the mother's new household
      expect(outcome.motherHouseholdMembers).not.toContain(families.find((f) => f.motherId === motherId)!.fatherId)
    }

    const stats = checkInvariants(world, sim.ctx.clock.tick, world.seed)
    expect(stats.violations).toBe(0)
  }, 120_000)
})
