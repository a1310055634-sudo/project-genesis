import { Rng, TICKS_PER_DAY } from '@genesis/core'
import { Person, SimContext, WorldState } from '@genesis/simulation'
import { clamp01, RelationshipGraph } from './graph'

/** Simplified calendar: 7 days per week (24h days, no weekdays). */
export const TICKS_PER_WEEK = TICKS_PER_DAY * 7
/** Edges whose last interaction is more than 180 days ago count as stale. */
export const DECAY_AFTER_TICKS = TICKS_PER_DAY * 180
/** Weekly multiplicative familiarity decay for stale edges. */
export const DECAY_FACTOR = 0.9

/**
 * Partner-selection cascade (KI-1 fix: local sampling bounds edge growth).
 * Branches are tried strictly in this order with a fixed rng draw order:
 *   1. household member with p = HOUSEHOLD_INTERACTION_PROBABILITY;
 *   2. coworker (same employer) with p = COWORKER_INTERACTION_PROBABILITY of
 *      the remaining cases;
 *   3. friend-of-a-friend with no extra gate: pick one of my friendships, then
 *      one of that friend's alive graph neighbors (the local growth path);
 *   4. global random stranger with p = GLOBAL_RANDOM_PROBABILITY — the only
 *      long-range tie maker, kept as a small fallback (KI-1).
 * If every branch misses, the person makes no interaction this week.
 */
export const HOUSEHOLD_INTERACTION_PROBABILITY = 0.5
export const COWORKER_INTERACTION_PROBABILITY = 0.3
export const GLOBAL_RANDOM_PROBABILITY = 0.1

/**
 * GEN-053b: interaction attempts are probabilistic and extraversion-driven.
 * p_attempt = clamp(BASE + WEIGHT * (extraversion - 0.5), 0, 1) — a recruit
 * with extraversion 1.0 attempts an interaction almost every week (p ≈ 1.0),
 * a 0.0-introvert only about one week in five (p ≈ 0.2); the 0.5 midpoint
 * keeps the population-average attempt rate at BASE. This is the personality
 * pathway into interaction FREQUENCY (liking/conflict modulation already
 * existed); a failed attempt skips the interaction but the person still takes
 * part in the death sweep and pruning phases like everyone else.
 */
export const INTERACTION_ATTEMPT_BASE_PROBABILITY = 0.6
export const INTERACTION_ATTEMPT_EXTRAVERSION_WEIGHT = 0.8

/** Weekly interaction-attempt probability for one person (GEN-053b). */
export function interactionAttemptProbability(person: Person): number {
  return clamp01(
    INTERACTION_ATTEMPT_BASE_PROBABILITY +
      INTERACTION_ATTEMPT_EXTRAVERSION_WEIGHT * (person.personality.extraversion - 0.5)
  )
}

/**
 * Acquaintance edges (neither endpoint lists the other in relationshipIds)
 * below this familiarity are pruned weekly (KI-1 fix). A single interaction
 * adds >= 0.05 familiarity, so the floor only ever catches edges that have
 * decayed through disuse — never freshly touched ones.
 */
export const PRUNE_FAMILIARITY_FLOOR = 0.05

/**
 * KI-6: mutual friendship edges below this familiarity drift apart — the edge
 * is removed and both relationshipIds are cleaned. Active friendships can
 * never cross the floor: every interaction adds >= 0.05 familiarity AND
 * refreshes lastInteractionTick, while decay only starts after 180 days
 * without contact (and 1.0 * 0.9^k < 0.15 needs ~18 stale weeks). The floor is
 * therefore reachable only after roughly half a year of total neglect.
 */
export const FRIENDSHIP_PRUNE_FLOOR = 0.15

/** Friendship formation thresholds. */
export const FRIENDSHIP_FAMILIARITY_THRESHOLD = 0.6
export const FRIENDSHIP_LIKING_THRESHOLD = 0.5

/**
 * Weekly social system logic — deterministic by construction.
 *
 * Fixed phase order: death sweep FIRST, then decay, then interactions, then
 * pruning.
 *
 * 0. Death sweep (KI-3): any edge with a dead endpoint is removed and BOTH
 *    sides drop each other from relationshipIds — death TERMINATES a
 *    relationship (this supersedes the earlier freeze semantics, KI-3). Each
 *    removed edge emits 'relationship.ended' with payload { reason: 'death' }
 *    (actorIds [liveId, deadId]; canonical [personA, personB] when both are
 *    dead) and bumps the 'social.edges_cleared_death' counter. The first run
 *    after this change sweeps all historical dead endpoints at once.
 *
 * 1. Decay: edges whose lastInteractionTick is more than DECAY_AFTER_TICKS
 *    (180 days) in the past get familiarity *= DECAY_FACTOR. Each stale edge
 *    decays exactly once per weekly run: allEdges() (key order) is iterated a
 *    single time, and interactions later in the same run refresh
 *    lastInteractionTick, so a freshly-touched edge is never decayed twice.
 *
 * 2. Interactions: every alive person, in world.persons creation (array)
 *    order, first rolls ONE attempt bool — rng.bool(interactionAttempt
 *    Probability(person)) (GEN-053b); a miss skips the person's interaction
 *    for this week (they still participate in phases 0 and 3). Persons that
 *    hit the roll then run the partner cascade with fixed rng draw order
 *    (constants documented above):
 *      a. rng.bool(HOUSEHOLD_INTERACTION_PROBABILITY): a random alive member
 *         of the same household;
 *      b. otherwise rng.bool(COWORKER_INTERACTION_PROBABILITY): a random
 *         alive coworker (same employerId);
 *      c. otherwise friend-of-friend, ungated: rng.pick over my
 *         relationshipIds (array order), then rng.pick over that friend's
 *         graph neighbors sorted by id (alive, self excluded);
 *      d. otherwise rng.bool(GLOBAL_RANDOM_PROBABILITY): a uniformly random
 *         alive person (never self).
 *    Effects: familiarity += U[0.05, 0.15]; liking/trust gains scale with the
 *    pair's mean agreeableness; conflict gain scales with mean neuroticism and
 *    is reduced by agreeableness; noise comes from the forked rng; every write
 *    is clamped to [0, 1]; lastInteractionTick = current tick.
 *
 * 3. Friendship: when familiarity > FRIENDSHIP_FAMILIARITY_THRESHOLD and
 *    liking > FRIENDSHIP_LIKING_THRESHOLD and the pair is not yet in each
 *    other's relationshipIds, both sides push the partner id and a
 *    'relationship.started' event is emitted (actorIds = [a, b]).
 *
 * 4. Pruning (KI-1/KI-6), in allEdges() key order:
 *    - mutual friendship edge below FRIENDSHIP_PRUNE_FLOOR: the friendship
 *      drifts apart — edge removed, both relationshipIds cleaned,
 *      'relationship.ended' emitted with payload { reason: 'drift' }, counter
 *      'social.friendships_drifted' bumped. The 0.05-per-interaction restore
 *      plus the 180-day decay delay protect active friendships from ever
 *      reaching the floor (see the constant's doc).
 *    - acquaintance edge below PRUNE_FAMILIARITY_FLOOR: removed silently
 *      (KI-1) — no events (high frequency, low value), only the aggregate
 *      'social.edges_pruned' counter is bumped.
 *    Mutuality is decided from a snapshot taken when the phase starts; each
 *    pair is visited exactly once, so mid-loop relationshipIds mutations
 *    cannot affect other pairs' decisions.
 *
 * All randomness comes from ctx.rng.fork(`social:${tick}`) — no Math.random,
 * no wall-clock time.
 */
export function weeklySocialUpdate(ctx: SimContext, graph: RelationshipGraph): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`social:${tick}`)
  const personById = new Map(ctx.world.persons.map((p) => [p.id, p]))

  // 0) death sweep (KI-3): death terminates relationships
  sweepDeadEdges(ctx, graph, personById, tick)

  // 1) decay stale edges — single pass in canonical key order
  for (const edge of graph.allEdges()) {
    if (tick - edge.lastInteractionTick > DECAY_AFTER_TICKS) {
      edge.familiarity = clamp01(edge.familiarity * DECAY_FACTOR)
    }
  }

  // 2) at most one social attempt per alive person, in array creation order
  const alive = ctx.world.persons.filter((p) => p.alive)
  if (alive.length >= 2) {
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
      // GEN-053b: one attempt bool per person, drawn in array order BEFORE
      // any cascade draws of that person — the rng sequence is fully
      // determined: for each person (array order) [attempt bool, then, when
      // attempted, the cascade draws]. A miss skips only this interaction.
      if (!rng.bool(interactionAttemptProbability(person))) continue
      const partner = pickPartner(rng, graph, person, alive, personById, memberIdsByHousehold, coworkersByEmployer)
      if (partner === null || partner.id === person.id) continue
      interact(ctx, graph, rng, tick, person, partner)
    }
  }

  // 3) pruning (KI-1/KI-6): drift terminations emit events, acquaintance
  //    prunes are silent — both only move aggregate counters
  pruneEdges(ctx, graph, personById)
}

/**
 * Cascade partner selection. The rng draw sequence is fixed (see the doc block
 * on weeklySocialUpdate): household bool, then coworker bool, then the
 * friend-of-friend picks, then the global-fallback bool + index — each branch
 * only draws when it is actually reached.
 */
function pickPartner(
  rng: Rng,
  graph: RelationshipGraph,
  person: Person,
  alive: Person[],
  personById: Map<string, Person>,
  memberIdsByHousehold: Map<string, string[]>,
  coworkersByEmployer: Map<string, Person[]>
): Person | null {
  let partner: Person | null = null

  // a. household; falls through when there is no eligible member
  if (rng.bool(HOUSEHOLD_INTERACTION_PROBABILITY)) {
    const memberIds = person.householdId === null ? [] : memberIdsByHousehold.get(person.householdId) ?? []
    const candidates: Person[] = []
    for (const memberId of memberIds) {
      const candidate = personById.get(memberId)
      if (candidate !== undefined && candidate.alive && candidate.id !== person.id) candidates.push(candidate)
    }
    if (candidates.length > 0) partner = rng.pick(candidates)
  }

  // b. coworkers (of the remaining cases)
  if (partner === null && person.economy.employerId !== null && rng.bool(COWORKER_INTERACTION_PROBABILITY)) {
    const coworkers = (coworkersByEmployer.get(person.economy.employerId) ?? []).filter((c) => c.id !== person.id)
    if (coworkers.length > 0) partner = rng.pick(coworkers)
  }

  // c. friend-of-a-friend (ungated local growth path)
  if (partner === null && person.social.relationshipIds.length > 0) {
    const friendId = rng.pick(person.social.relationshipIds)
    const candidates = graph
      .neighborsOf(friendId)
      .map((id) => personById.get(id))
      .filter((p): p is Person => p !== undefined && p.alive && p.id !== person.id)
    if (candidates.length > 0) partner = rng.pick(candidates)
  }

  // d. global random stranger — 10% fallback only (KI-1)
  if (partner === null && rng.bool(GLOBAL_RANDOM_PROBABILITY)) {
    const index = rng.int(0, alive.length - 1)
    const candidate = alive[index]
    partner = candidate.id === person.id ? alive[(index + 1) % alive.length] : candidate
  }

  return partner
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
    edge.familiarity > FRIENDSHIP_FAMILIARITY_THRESHOLD &&
    edge.liking > FRIENDSHIP_LIKING_THRESHOLD &&
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

/** Remove otherId from person's relationshipIds when present. */
function removeFromRelationships(person: Person, otherId: string): void {
  const index = person.social.relationshipIds.indexOf(otherId)
  if (index >= 0) person.social.relationshipIds.splice(index, 1)
}

/**
 * KI-3 death sweep: remove every edge with a dead endpoint, clean both sides'
 * relationshipIds (death terminates the relationship in BOTH directions — no
 * residual references), emit one 'relationship.ended' { reason: 'death' } per
 * edge and count it under 'social.edges_cleared_death'. Single pass over
 * allEdges() (key order) keeps it deterministic; the first run after this
 * change sweeps the historical backlog of dead endpoints at once.
 */
function sweepDeadEdges(
  ctx: SimContext,
  graph: RelationshipGraph,
  personById: Map<string, Person>,
  tick: number
): void {
  for (const edge of graph.allEdges()) {
    const a = personById.get(edge.personA)
    const b = personById.get(edge.personB)
    if (a === undefined || b === undefined) continue // defensive: unknown ids are not ours to sweep
    if (a.alive && b.alive) continue
    graph.removeEdge(edge.personA, edge.personB)
    removeFromRelationships(a, b.id)
    removeFromRelationships(b, a.id)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'relationship.ended',
      tick,
      actorIds: a.alive || b.alive ? [(a.alive ? a : b).id, (a.alive ? b : a).id] : [edge.personA, edge.personB],
      payload: { reason: 'death' }
    })
    ctx.metrics.increment('social.edges_cleared_death')
  }
}

/**
 * Pruning (KI-1/KI-6). Mutual friendship edges below FRIENDSHIP_PRUNE_FLOOR
 * drift apart: edge removed, both relationshipIds cleaned, 'relationship.ended'
 * { reason: 'drift' } emitted, 'social.friendships_drifted' counted.
 * Acquaintance edges below PRUNE_FAMILIARITY_FLOOR are removed silently
 * ('social.edges_pruned'). Mutuality comes from a snapshot taken at phase
 * start; each pair is visited exactly once, so mid-loop mutations of
 * relationshipIds cannot influence other pairs' decisions.
 */
function pruneEdges(ctx: SimContext, graph: RelationshipGraph, personById: Map<string, Person>): void {
  // directed[a|b] = a lists b as a relationship; two membership probes decide mutuality
  const directed = new Set<string>()
  for (const person of personById.values()) {
    for (const relId of person.social.relationshipIds) directed.add(`${person.id}|${relId}`)
  }
  let pruned = 0
  let drifted = 0
  for (const edge of graph.allEdges()) {
    const mutual =
      directed.has(`${edge.personA}|${edge.personB}`) && directed.has(`${edge.personB}|${edge.personA}`)
    if (mutual) {
      if (edge.familiarity < FRIENDSHIP_PRUNE_FLOOR) {
        graph.removeEdge(edge.personA, edge.personB)
        removeFromRelationships(personById.get(edge.personA) as Person, edge.personB)
        removeFromRelationships(personById.get(edge.personB) as Person, edge.personA)
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'relationship.ended',
          tick: ctx.tick(),
          actorIds: [edge.personA, edge.personB],
          payload: { reason: 'drift' }
        })
        drifted++
      }
    } else if (edge.familiarity < PRUNE_FAMILIARITY_FLOOR) {
      graph.removeEdge(edge.personA, edge.personB)
      pruned++
    }
  }
  if (pruned > 0) ctx.metrics.increment('social.edges_pruned', pruned)
  if (drifted > 0) ctx.metrics.increment('social.friendships_drifted', drifted)
}
