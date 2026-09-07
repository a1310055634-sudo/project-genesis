import { Rng, TICKS_PER_DAY } from '@genesis/core'
import { Person, SimContext } from '@genesis/simulation'
import { clamp01, RelationshipGraph } from './graph'

/** Simplified calendar: 7 days per week (24h days, no weekdays). */
export const TICKS_PER_WEEK = TICKS_PER_DAY * 7
/** Edges whose last interaction is more than 180 days ago count as stale. */
export const DECAY_AFTER_TICKS = TICKS_PER_DAY * 180
/** Weekly multiplicative familiarity decay for stale edges. */
export const DECAY_FACTOR = 0.9

/**
 * Weekly social system logic — deterministic by construction:
 *
 * Fixed phase order: decay FIRST, then interactions.
 *
 * 1. Decay: edges whose lastInteractionTick is more than DECAY_AFTER_TICKS
 *    (180 days) in the past get familiarity *= DECAY_FACTOR. Each stale edge
 *    decays exactly once per weekly run: allEdges() (key order) is iterated a
 *    single time, and interactions later in the same run refresh
 *    lastInteractionTick, so a freshly-touched edge is never decayed twice.
 *
 * 2. Interactions: every alive person, in world.persons creation (array)
 *    order, makes exactly one social attempt. Partner choice is sequential:
 *      a. with p=0.5 a random alive member of the same household;
 *      b. otherwise, with p=0.3, a random alive coworker (same employerId);
 *      c. otherwise a uniformly random alive person (never self).
 *    Effects: familiarity += U[0.05, 0.15]; liking/trust gains scale with the
 *    pair's mean agreeableness; conflict gain scales with mean neuroticism and
 *    is reduced by agreeableness; noise comes from the forked rng; every write
 *    is clamped to [0, 1]; lastInteractionTick = current tick.
 *
 * 3. Friendship: when familiarity > 0.6 and liking > 0.5 and the pair is not
 *    yet in each other's relationshipIds, both sides push the partner id and a
 *    'relationship.started' event is emitted (actorIds = [a, b]).
 *
 * All randomness comes from ctx.rng.fork(`social:${tick}`) — no Math.random,
 * no wall-clock time.
 */
export function weeklySocialUpdate(ctx: SimContext, graph: RelationshipGraph): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`social:${tick}`)

  // 1) decay stale edges — single pass in canonical key order
  for (const edge of graph.allEdges()) {
    if (tick - edge.lastInteractionTick > DECAY_AFTER_TICKS) {
      edge.familiarity = clamp01(edge.familiarity * DECAY_FACTOR)
    }
  }

  // 2) one social attempt per alive person, in array creation order
  const alive = ctx.world.persons.filter((p) => p.alive)
  if (alive.length < 2) return
  const personById = new Map(ctx.world.persons.map((p) => [p.id, p]))
  const memberIdsByHousehold = new Map<string, string[]>()
  for (const household of ctx.world.households) memberIdsByHousehold.set(household.id, household.memberIds)
  const coworkersByEmployer = new Map<string, Person[]>()
  for (const p of alive) {
    const employerId = p.economy.employerId
    if (employerId === null) continue
    const list = coworkersByEmployer.get(employerId)
    if (list === undefined) coworkersByEmployer.set(employerId, [p])
    else list.push(p)
  }

  for (const person of alive) {
    let partner: Person | null = null

    // a. household (p=0.5); falls through when there is no eligible member
    if (rng.bool(0.5)) {
      const memberIds = person.householdId === null ? [] : memberIdsByHousehold.get(person.householdId) ?? []
      const candidates: Person[] = []
      for (const memberId of memberIds) {
        const candidate = personById.get(memberId)
        if (candidate !== undefined && candidate.alive && candidate.id !== person.id) candidates.push(candidate)
      }
      if (candidates.length > 0) partner = rng.pick(candidates)
    }

    // b. coworkers (p=0.3 of the remaining cases)
    if (partner === null && person.economy.employerId !== null && rng.bool(0.3)) {
      const coworkers = (coworkersByEmployer.get(person.economy.employerId) ?? []).filter((c) => c.id !== person.id)
      if (coworkers.length > 0) partner = rng.pick(coworkers)
    }

    // c. random alive person (deterministically never self)
    if (partner === null) {
      const index = rng.int(0, alive.length - 1)
      const candidate = alive[index]
      partner = candidate.id === person.id ? alive[(index + 1) % alive.length] : candidate
    }

    if (partner.id === person.id) continue // defensive: population of a single alive person
    interact(ctx, graph, rng, tick, person, partner)
  }
}

/** One social interaction: mutate the shared edge, maybe record a friendship. */
function interact(ctx: SimContext, graph: RelationshipGraph, rng: Rng, tick: number, a: Person, b: Person): void {
  const edge = graph.ensureEdge(a.id, b.id, tick)
  const agreeableness = (a.personality.agreeableness + b.personality.agreeableness) / 2
  const neuroticism = (a.personality.neuroticism + b.personality.neuroticism) / 2

  edge.familiarity = clamp01(edge.familiarity + 0.05 + rng.next() * 0.1)
  edge.liking = clamp01(edge.liking + 0.02 + 0.06 * agreeableness + (rng.next() - 0.5) * 0.04)
  edge.trust = clamp01(edge.trust + 0.02 + 0.05 * agreeableness + (rng.next() - 0.5) * 0.04)
  edge.conflict = clamp01(edge.conflict + 0.05 * neuroticism - 0.02 * agreeableness + (rng.next() - 0.5) * 0.02)
  edge.lastInteractionTick = tick

  if (
    edge.familiarity > 0.6 &&
    edge.liking > 0.5 &&
    !a.social.relationshipIds.includes(b.id) &&
    !b.social.relationshipIds.includes(a.id)
  ) {
    a.social.relationshipIds.push(b.id)
    b.social.relationshipIds.push(a.id)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'relationship.started',
      tick,
      actorIds: [a.id, b.id],
      payload: { key: edge.key }
    })
  }
}
