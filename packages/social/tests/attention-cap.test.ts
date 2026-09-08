import { describe, expect, it } from 'vitest'
import { TICKS_PER_WEEK } from '@genesis/social'
import { checkInvariants, createHousehold, demographicsSystem, Simulation } from '@genesis/simulation'
import { friendCap, RelationshipGraph, socialSystem } from '@genesis/social'

/**
 * Attention budget (KI-8): a person at their friendship cap cannot form NEW
 * friendships (existing ties and their maintenance are unaffected), and once
 * a slot frees up, a qualifying tie can form.
 *
 * Deterministic construction: A has extraversion 0 (cap = FRIENDSHIP_CAP_BASE),
 * is stuffed to exactly that cap, and shares a household with B (extraversion
 * 1.0 → weekly attempt probability 1.0). The A-B edge is pre-raised above the
 * friendship thresholds so the first interaction would form the friendship if
 * a slot were free.
 */
describe('attention budget — friendship cap (KI-8)', () => {
  it('blocks new friendships at the cap; forms once a slot frees', () => {
    const graph = new RelationshipGraph()
    const sim = Simulation.create(
      { seed: 42, populationTarget: 60, years: 1 },
      { systems: [demographicsSystem, socialSystem(graph)] }
    )
    const world = sim.ctx.world
    const byId = new Map(world.persons.map((p) => [p.id, p]))

    const a = world.persons.find((p) => p.alive && p.sex === 'male')
    const b = world.persons.find((p) => p.alive && p.sex === 'female' && p.id !== a?.id)
    if (a === undefined || b === undefined) throw new Error('fixture persons missing')

    // engineer: A introvert at cap, B extravert with attempt p=1.0
    // (detach both from any generated spouse first — partner-mutual invariant)
    for (const person of [a, b]) {
      if (person.partnerId !== null) {
        const partner = byId.get(person.partnerId)
        if (partner !== undefined) {
          partner.partnerId = null
          partner.maritalStatus = 'single'
        }
      }
      person.partnerId = null
      person.maritalStatus = 'single'
    }
    a.personality.extraversion = 0
    b.personality.extraversion = 1.0

    // co-residence: move both into one fresh household (deterministic partner
    // selection source for the weekly interaction)
    for (const person of [a, b]) {
      if (person.householdId !== null) {
        const old = world.households.find((h) => h.id === person.householdId)
        if (old !== undefined) old.memberIds = old.memberIds.filter((id) => id !== person.id)
      }
      person.householdId = null
    }
    const shared = createHousehold(sim.ctx, [a.id, b.id])
    void shared

    // stuff A to exactly its cap with filler mutual friendships (alive persons)
    const fillers = world.persons.filter((p) => p.alive && p.id !== a.id && p.id !== b.id).slice(0, friendCap(a))
    expect(fillers.length).toBe(friendCap(a))
    a.social.relationshipIds = fillers.map((p) => p.id)

    // raise the A-B edge above the friendship thresholds
    const edge = graph.ensureEdge(a.id, b.id, 0)
    edge.familiarity = 0.7
    edge.liking = 0.7
    edge.trust = 0.5

    // phase 1: 12 weeks at cap — the friendship must never form
    for (let w = 1; w <= 12; w++) sim.stepTo(sim.ctx.clock.tick + TICKS_PER_WEEK)
    expect(a.social.relationshipIds).not.toContain(b.id)
    expect(b.social.relationshipIds).not.toContain(a.id)
    const startsWhileAtCap = sim.ctx.log
      .recentEvents()
      .filter((e) => e.type === 'relationship.started' && e.actorIds.includes(a.id) && e.actorIds.includes(b.id))
    expect(startsWhileAtCap.length).toBe(0)

    // phase 2: free one slot — the same qualifying edge may now form
    a.social.relationshipIds = a.social.relationshipIds.slice(1)
    for (let w = 1; w <= 24; w++) sim.stepTo(sim.ctx.clock.tick + TICKS_PER_WEEK)
    expect(a.social.relationshipIds).toContain(b.id)
    expect(b.social.relationshipIds).toContain(a.id)

    // existing stuffed ties were maintained throughout (cap only gates NEW ties)
    for (const filler of fillers.slice(1)) {
      expect(a.social.relationshipIds).toContain(filler.id)
    }

    expect(checkInvariants(world, sim.ctx.clock.tick, world.seed).violations).toBe(0)
    expect(sim.ctx.log.countOf('relationship.started')).toBeGreaterThan(0)
  }, 120_000)
})
