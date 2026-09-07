import { describe, expect, it } from 'vitest'
import { SimulationEvent } from '@genesis/core'
import { checkInvariants, demographicsSystem, Person, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

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

    // the lexicographically larger id moved into a NEW single-person household
    const movedOut = cleanEndStates.filter(([aId, bId]) => {
      const moverId = [aId, bId].sort()[1] as string
      const stayerId = moverId === aId ? bId : aId
      const mover = byId.get(moverId) as Person
      const stayer = byId.get(stayerId) as Person
      if (mover.householdId === null || mover.householdId === stayer.householdId) return false
      const household = sim.ctx.world.households.find((h) => h.id === mover.householdId)
      return household !== undefined && household.memberIds.length === 1 && household.memberIds[0] === mover.id
    })
    expect(movedOut.length).toBeGreaterThan(0)

    const stats = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
    expect(stats.violations).toBe(0)
  }, 120_000)
})
