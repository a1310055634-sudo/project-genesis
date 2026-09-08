import { ageYears } from '@genesis/core'
import { addMoney, Cents, splitMoney } from '@genesis/shared'
import {
  buildKinshipIndex,
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
 *   1. inheritance  — resolves the surviving spouse from the deceased's
 *      death-time snapshot (spouseAtDeathId, written by demographics at the
 *      moment of death), so ordering vs widowhood no longer matters;
 *   2. widowhood    — safety net for any married-to-dead state that slipped
 *      past demographics' death-time handling (normally a no-op now);
 *   3. marriage     — courtship among friends from the social graph;
 *   4. divorce      — couple-level conflict roll, one roll per couple, plus
 *      child custody for the minors of the shared household.
 *
 * Determinism: every random draw comes from ctx.rng.fork() with a distinct
 * per-step, per-tick label (`family:<phase>:<tick>`); iteration is always in
 * world.persons creation (array) order; couple dedup uses a sorted-pair key.
 * Inheritance and widowhood draw no randomness at all.
 *
 * Money: estate transfers move exact integer cents (sum preserved — what one
 * side loses the other gains, via @genesis/shared addMoney).
 *
 * Recorded simplifications:
 * - estate: spouse 50% + children split the rest; spouse takes all only when
   there are no alive children; unclaimed estates land in an audit gauge;
 * - only opposite-sex marriage is modelled;
 * - the close-kin marriage ban uses kinship depth v2 (GEN-060, Wave 3.3,
   red team RT2-07): blood to the second degree — parent/child, full/half
   siblings, grandparent/grandchild, uncle/aunt vs nephew/niece, first
   cousins — AND first-degree affinity over both spouse-edge kinds
   (partnerId and the spouseAtDeathId snapshot): parents-in-law /
   children-in-law, spouse's siblings / siblings' spouses, step-parents /
   step-children;
 * - v2 depth boundary (recorded simplification, not an oversight): further
   relations stay marriage-allowed — great-grandparents, first cousins'
   children, second cousins, an uncle's/aunt's spouse, a spouse's sibling's
   spouse, blended step-siblings (a parent's spouse's own children) and
   double in-law pairs;
 * - when spouses from different households marry, only the spouses move into
   the new household — children stay behind in their original household;
 * - on divorce the minors of the shared household follow their mother (or the
   father when the mother is absent or dead; otherwise they stay put) —
   GEN-074 v1 custody rule;
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
 * parenthood chain; RT2-01 spouse snapshot):
 *   - the surviving spouse is located via the deceased's spouseAtDeathId —
 *     a death-time snapshot written by demographics, so inheritance works
 *     regardless of system ordering (partnerId is already cleared by then);
 *   - surviving spouse AND alive children → spouse 50% (floor), children split
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
    const snapshottedSpouse = deceased.spouseAtDeathId
    const partner = snapshottedSpouse !== null ? personById.get(snapshottedSpouse) : undefined
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
 * marriage only) who are NOT close kin (GEN-060 via kinship v2: no blood kin
 * to the second degree — parent/child, sibling, grandparent/grandchild,
 * uncle/aunt, first cousin — and no first-degree affinity: in-laws and
 * step-relations), in relationshipIds order, up to MAX_COURTSHIP_ATTEMPTS
 * attempts. Each attempt rolls p_marry = clamp(0.02 + 0.12 * affinity, 0,
 * 0.2); the first hit marries the pair (mutual partnerId + status) and merges
 * households when they differ.
 */
function runMarriages(ctx: SimContext, deps: FamilyDeps | undefined): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`family:marriage:${tick}`)
  const personById = indexPersons(ctx)
  const households = indexHouseholds(ctx)
  // one kinship index per monthly run (O(N) build) — never rebuilt per couple
  const kin = buildKinshipIndex(ctx.world)

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
          c.sex !== seeker.sex && // v1: opposite-sex marriage only
          !kin.isCloseKin(seeker, c) // GEN-060: close-kin marriage ban
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
 * Custodial parent of one minor (GEN-074 v1): the mother while she is alive
 * and lives in the pre-split household, otherwise the father under the same
 * conditions, otherwise nobody — the child stays where it is.
 */
function custodialParent(
  minor: Person,
  personById: Map<string, Person>,
  householdId: string | null
): Person | undefined {
  for (const parentId of [minor.motherId, minor.fatherId]) {
    if (parentId === null) continue
    const parent = personById.get(parentId)
    if (parent !== undefined && parent.alive && parent.householdId === householdId) return parent
  }
  return undefined
}

/**
 * One conflict roll per married couple (a sorted-pair key set makes each
 * couple processed exactly once despite the array-order scan):
 * p_divorce = clamp(0.0005 + 0.02 * conflict, 0, 0.05). On a hit both sides
 * are cleared together (partnerId = null, status 'divorced') so the mutual
 * partnership invariants hold at every instant, and the lexicographically
 * larger id moves out into a new household. Custody (GEN-074 v1): minors of
 * the shared household whose custodial parent is the mover relocate with them
 * (mother first, else father, else they stay); the relationship.ended payload
 * reports how many children moved.
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

    // the household being split (spouses cohabit; defensive fallback either way)
    const householdId = person.householdId ?? partner.householdId
    const household = householdId !== null ? households.get(householdId) : undefined

    const moverId = [person.id, partner.id].sort()[1] as string
    const mover = moverId === person.id ? person : partner

    // custody: resolved BEFORE anyone leaves (it reads parent.householdId);
    // minors are visited in the household's memberIds (array) order
    const minors = (household?.memberIds ?? [])
      .map((memberId) => personById.get(memberId))
      .filter((m): m is Person => m !== undefined && m.lifeStage === 'child')
    const relocate: Person[] = []
    for (const minor of minors) {
      const custody = custodialParent(minor, personById, householdId)
      if (custody !== undefined && custody.id === mover.id) relocate.push(minor)
    }

    leaveHousehold(ctx, households, mover)
    for (const child of relocate) {
      if (household !== undefined) household.memberIds = household.memberIds.filter((id) => id !== child.id)
      child.householdId = null
    }
    // 'household.created' is emitted by createHousehold for mover + children
    createHousehold(ctx, [mover.id, ...relocate.map((c) => c.id)])

    ctx.metrics.increment('family.divorces')
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'relationship.ended',
      tick,
      actorIds: [person.id, partner.id],
      payload: { reason: 'divorce', childrenMoved: relocate.length }
    })
  }
}

// ---------------------------------------------------------------------------
// The system
// ---------------------------------------------------------------------------

/**
 * Marriage-pool health gauge (batch 6): live population per inhabited
 * household (0 when no household has members). Marriage/divorce totals are
 * already streamed as the 'family.marriages' / 'family.divorces' counters.
 */
function recordHouseholdMetrics(ctx: SimContext): void {
  let alive = 0
  for (const person of ctx.world.persons) if (person.alive) alive++
  let inhabited = 0
  for (const household of ctx.world.households) if (household.memberIds.length > 0) inhabited++
  ctx.metrics.gauge('family.avg_household_size', inhabited === 0 ? 0 : alive / inhabited)
}

/**
 * Phase 5 — household GC (red team RT1-14): remove households with zero
 * members. Moves (marriage/divorce) and deaths leave empty shells behind, and
 * without GC the household count grows without bound. Safe: a household is
 * referenced only via person.householdId, and every path that empties it also
 * clears the members' householdId. Deterministic single in-order filter pass;
 * no randomness, no events (pure bookkeeping).
 */
function runHouseholdGc(ctx: SimContext): void {
  const before = ctx.world.households.length
  ctx.world.households = ctx.world.households.filter((h) => h.memberIds.length > 0)
  ctx.metrics.increment('family.households_gc', before - ctx.world.households.length)
}

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
      runInheritance(ctx) // resolves heirs from the death-time spouse snapshot
      runWidowhood(ctx)
      runMarriages(ctx, deps)
      runDivorces(ctx, deps)
      runHouseholdGc(ctx)
      recordHouseholdMetrics(ctx)
      ctx.metrics.increment('family.months_processed')
    }
  }
}
