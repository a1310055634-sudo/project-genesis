import { ageYears } from '@genesis/core'
import { addMoney, Cents, splitMoney } from '@genesis/shared'
import {
  createHousehold,
  GenesisSystem,
  Household,
  nextMonthStart,
  Person,
  SimContext
} from '@genesis/simulation'

/**
 * Family & marriage domain (Wave 3): inheritance, widowhood, marriage and
 * divorce. One monthly system, priority 12 — it runs AFTER demographics
 * (priority 10, so this month's deaths are already registered) and BEFORE the
 * economy payroll (priority 21).
 *
 * Fixed phase order inside a monthly run (order matters):
 *   1. inheritance  — must precede widowhood: the estate transfer locates the
 *      surviving spouse through the deceased's (still intact) partnerId;
 *   2. widowhood    — clears both sides of a marriage ended by death;
 *   3. marriage     — courtship among friends from the social graph;
 *   4. divorce      — couple-level conflict roll, one roll per couple.
 *
 * Determinism: every random draw comes from ctx.rng.fork() with a distinct
 * per-step, per-tick label (`family:<phase>:<tick>`); iteration is always in
 * world.persons creation (array) order; couple dedup uses a sorted-pair key.
 * Inheritance and widowhood draw no randomness at all.
 *
 * Money: estate transfers move exact integer cents (sum preserved — what one
 * side loses the other gains, via @genesis/shared addMoney).
 *
 * Recorded v1 simplifications:
 * - estate: spouse 50% + children split the rest; spouse takes all only when
   there are no alive children; unclaimed estates land in an audit gauge;
 * - only opposite-sex marriage is modelled;
 * - when spouses from different households marry, only the spouses move into
   the new household — children stay behind in their original household;
 * - empty households left behind by a move are not garbage-collected.
 */

/** Marriage age window (inclusive), v1 constant. */
const MARRIAGE_MIN_AGE = 20
const MARRIAGE_MAX_AGE = 60
/** Max courtship attempts (candidate friends) per person per monthly run. */
const MAX_COURTSHIP_ATTEMPTS = 3

/** Injected domain hooks — affinity/conflict come from the social graph. */
export interface FamilyDeps {
  /** Pair affinity in [0, 1] from the social graph; default 0.3. */
  affinity?: (ctx: SimContext, aId: string, bId: string) => number
  /** Pair conflict in [0, 1] from the social graph; default 0.1. */
  conflict?: (ctx: SimContext, aId: string, bId: string) => number
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** Unmarried and inside the v1 marriage age window. */
function isMarriageEligible(person: Person, tick: number): boolean {
  if (!person.alive) return false
  const age = ageYears(person.birthTick, tick)
  if (age < MARRIAGE_MIN_AGE || age > MARRIAGE_MAX_AGE) return false
  return person.maritalStatus === 'single' || person.maritalStatus === 'divorced' || person.maritalStatus === 'widowed'
}

function indexPersons(ctx: SimContext): Map<string, Person> {
  return new Map(ctx.world.persons.map((p) => [p.id, p]))
}

function indexHouseholds(ctx: SimContext): Map<string, Household> {
  return new Map(ctx.world.households.map((h) => [h.id, h]))
}

/** Remove a person from their current household (no-op when household-less). */
function leaveHousehold(ctx: SimContext, households: Map<string, Household>, person: Person): void {
  if (person.householdId === null) return
  const household = households.get(person.householdId)
  if (household !== undefined) {
    household.memberIds = household.memberIds.filter((id) => id !== person.id)
  }
  person.householdId = null
}

// ---------------------------------------------------------------------------
// Phase 1: inheritance
// ---------------------------------------------------------------------------

/**
 * Every dead person holding a non-zero estate distributes it (RT1-01
 * parenthood chain):
 *   - surviving spouse AND alive children  → spouse 50% (floor), children split
 *     the remainder evenly (remainder cents to the first children, array order);
 *   - spouse only (no children)            → spouse takes the whole estate;
 *   - children only (no spouse)            → children split the whole estate;
 *   - neither                              → unclaimed, accumulated into the
 *     'family.estates_unclaimed_cents' gauge so conservation is auditable.
 * Heirs are resolved deterministically (world array order, splitMoney keeps
 * the cent sum exact). No randomness.
 */
function runInheritance(ctx: SimContext): void {
  const tick = ctx.tick()
  const personById = indexPersons(ctx)
  let unclaimed: Cents = 0
  for (const deceased of ctx.world.persons) {
    if (deceased.alive || deceased.economy.wealthCents === 0) continue
    const estate = deceased.economy.wealthCents
    const partner = deceased.partnerId !== null ? personById.get(deceased.partnerId) : undefined
    const spouse = partner !== undefined && partner.alive ? partner : undefined
    const children = ctx.world.persons.filter(
      (p) => p.alive && (p.motherId === deceased.id || p.fatherId === deceased.id)
    )

    const shares: Array<{ heir: Person; amount: Cents; relation: 'spouse' | 'child' }> = []
    if (spouse !== undefined && children.length === 0) {
      shares.push({ heir: spouse, amount: estate, relation: 'spouse' })
    } else if (spouse !== undefined) {
      const spouseShare = Math.floor(estate / 2)
      shares.push({ heir: spouse, amount: spouseShare, relation: 'spouse' })
      const rest = splitMoney(estate - spouseShare, children.length)
      children.forEach((child, i) => shares.push({ heir: child, amount: rest[i] as Cents, relation: 'child' }))
    } else if (children.length > 0) {
      const parts = splitMoney(estate, children.length)
      children.forEach((child, i) => shares.push({ heir: child, amount: parts[i] as Cents, relation: 'child' }))
    } else {
      unclaimed = addMoney(unclaimed, estate)
    }

    for (const { heir, amount, relation } of shares) {
      if (amount === 0) continue
      // exact conservation: heir gains exactly what the estate gives up
      heir.economy.wealthCents = addMoney(heir.economy.wealthCents, amount)
      ctx.events.emit({
        id: ctx.ids.next('event'),
        type: 'wealth.inherited',
        tick,
        actorIds: [deceased.id, heir.id],
        payload: { amountCents: amount, relation }
      })
    }
    deceased.economy.wealthCents = 0
  }
  if (unclaimed !== 0) {
    // gauge overwrites, so accumulate on top of the previous value
    const name = 'family.estates_unclaimed_cents'
    ctx.metrics.gauge(name, addMoney(ctx.metrics.gaugeValue(name), unclaimed))
  }
}

// ---------------------------------------------------------------------------
// Phase 2: widowhood
// ---------------------------------------------------------------------------

/**
 * An alive person whose partner has died becomes widowed and partner-less.
 * The deceased's side is cleared too (partnerId = null, 'married' ->
 * 'widowed'): a dangling partnerId on a dead person would break the global
 * partner-mutual invariant, and 'married' without a partner would break
 * married-has-partner. No randomness.
 */
function runWidowhood(ctx: SimContext): void {
  const tick = ctx.tick()
  const personById = indexPersons(ctx)
  for (const survivor of ctx.world.persons) {
    if (!survivor.alive || survivor.partnerId === null) continue
    const deceased = personById.get(survivor.partnerId)
    if (deceased === undefined || deceased.alive) continue

    survivor.partnerId = null
    survivor.maritalStatus = 'widowed'
    deceased.partnerId = null
    if (deceased.maritalStatus === 'married') deceased.maritalStatus = 'widowed'

    ctx.metrics.increment('family.widowed')
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'relationship.ended',
      tick,
      actorIds: [survivor.id, deceased.id],
      payload: { reason: 'widowhood' }
    })
  }
}

// ---------------------------------------------------------------------------
// Phase 3: marriage
// ---------------------------------------------------------------------------

function marry(ctx: SimContext, households: Map<string, Household>, a: Person, b: Person): void {
  a.partnerId = b.id
  b.partnerId = a.id
  a.maritalStatus = 'married'
  b.maritalStatus = 'married'

  let householdId: string
  if (a.householdId !== null && a.householdId === b.householdId) {
    householdId = a.householdId // already cohabiting — nothing to move
  } else {
    // Different households: both spouses move into one new household.
    // Known simplification: children stay behind in their original household.
    leaveHousehold(ctx, households, a)
    leaveHousehold(ctx, households, b)
    householdId = createHousehold(ctx, [a.id, b.id]).id
  }

  ctx.metrics.increment('family.marriages')
  ctx.events.emit({
    id: ctx.ids.next('event'),
    type: 'marriage.created',
    tick: ctx.tick(),
    actorIds: [a.id, b.id],
    payload: { householdId }
  })
}

/**
 * Courtship: candidates are the seeker's own friends (social.relationshipIds),
 * filtered to alive, eligible, opposite-sex persons (v1 models opposite-sex
 * marriage only), in relationshipIds order, up to MAX_COURTSHIP_ATTEMPTS
 * attempts. Each attempt rolls p_marry = clamp(0.02 + 0.12 * affinity, 0, 0.2);
 * the first hit marries the pair (mutual partnerId + status) and merges
 * households when they differ.
 */
function runMarriages(ctx: SimContext, deps: FamilyDeps | undefined): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`family:marriage:${tick}`)
  const personById = indexPersons(ctx)
  const households = indexHouseholds(ctx)

  const pool = ctx.world.persons.filter((p) => isMarriageEligible(p, tick))
  for (const seeker of pool) {
    // the seeker may already have married earlier in this run as a candidate
    if (!isMarriageEligible(seeker, tick)) continue
    const candidates = seeker.social.relationshipIds
      .map((id) => personById.get(id))
      .filter(
        (c): c is Person =>
          c !== undefined &&
          c.id !== seeker.id &&
          c.alive &&
          isMarriageEligible(c, tick) &&
          c.sex !== seeker.sex // v1: opposite-sex marriage only
      )
      .slice(0, MAX_COURTSHIP_ATTEMPTS)
    for (const candidate of candidates) {
      const affinity = deps?.affinity?.(ctx, seeker.id, candidate.id) ?? 0.3
      const pMarry = clamp(0.02 + 0.12 * affinity, 0, 0.2)
      if (!rng.bool(pMarry)) continue
      marry(ctx, households, seeker, candidate)
      break // one marriage per person per run
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 4: divorce
// ---------------------------------------------------------------------------

/**
 * One conflict roll per married couple (a sorted-pair key set makes each
 * couple processed exactly once despite the array-order scan):
 * p_divorce = clamp(0.0005 + 0.02 * conflict, 0, 0.05). On a hit both sides
 * are cleared together (partnerId = null, status 'divorced') so the mutual
 * partnership invariants hold at every instant, and the lexicographically
 * larger id moves out into a new single-person household.
 */
function runDivorces(ctx: SimContext, deps: FamilyDeps | undefined): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`family:divorce:${tick}`)
  const personById = indexPersons(ctx)
  const households = indexHouseholds(ctx)
  const processed = new Set<string>()

  for (const person of ctx.world.persons) {
    if (!person.alive || person.maritalStatus !== 'married' || person.partnerId === null) continue
    const partner = personById.get(person.partnerId)
    // defensive: widowhood already dissolved couples with a dead spouse
    if (partner === undefined || !partner.alive) continue
    const key = [person.id, partner.id].sort().join('|')
    if (processed.has(key)) continue
    processed.add(key)

    const conflict = deps?.conflict?.(ctx, person.id, partner.id) ?? 0.1
    const pDivorce = clamp(0.0005 + 0.02 * conflict, 0, 0.05)
    if (!rng.bool(pDivorce)) continue

    person.partnerId = null
    person.maritalStatus = 'divorced'
    partner.partnerId = null
    partner.maritalStatus = 'divorced'

    const moverId = [person.id, partner.id].sort()[1] as string
    const mover = moverId === person.id ? person : partner
    leaveHousehold(ctx, households, mover)
    createHousehold(ctx, [mover.id])

    ctx.metrics.increment('family.divorces')
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'relationship.ended',
      tick,
      actorIds: [person.id, partner.id],
      payload: { reason: 'divorce' }
    })
  }
}

// ---------------------------------------------------------------------------
// The system
// ---------------------------------------------------------------------------

/**
 * Monthly family system: nextFireTick = (floor(tick / 720) + 1) * 720
 * (month boundaries via nextMonthStart), priority 12 — after demographics
 * (10), before economy payroll (21).
 */
export function familySystem(deps?: FamilyDeps): GenesisSystem {
  return {
    id: 'family',
    priority: 12,
    nextFireTick: nextMonthStart,
    run(ctx: SimContext) {
      runInheritance(ctx) // before widowhood: needs the deceased's partnerId
      runWidowhood(ctx)
      runMarriages(ctx, deps)
      runDivorces(ctx, deps)
      ctx.metrics.increment('family.months_processed')
    }
  }
}
