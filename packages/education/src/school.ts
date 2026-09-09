import { ageYears } from '@genesis/core'
import { SimContext } from '@genesis/simulation'
import { EducationDeps } from './types'
import { Attainment, EducationRecord, ensureRecords } from './types'

/**
 * Education mechanics (HT-12): school-age enrollment, monthly progression
 * (graduation / dropout rolls and skill growth) and world-level gauges.
 *
 * Determinism:
 * - the ONLY randomness consumer is monthlyProgress, and every draw comes from
 *   ctx.rng.fork(`education:${tick}`) (Math.random/Date.now are banned);
 *   schoolAgeAssignments and educationMetrics are fully deterministic;
 * - persons are iterated in world.persons creation (array) order, so the RNG
 *   stream is consumed in a fixed order;
 * - the records side table is only counted via world order or sorted keys
 *   (float sums iterate entries sorted by personId).
 *
 * Recorded v1 simplifications:
 * - World bootstrap: EVERY alive person aged 6+ without a record enrolls at
 *   the first monthly run ("年满 6 岁即可" rule) and flows through the
 *   pipeline once — v1 does not backfill plausible historical attainments for
 *   founders, so adult/senior founders graduate through the same rolls as
 *   children (their skill starts at 0 and grows by the same rates);
 * - dropout is TERMINAL (GEN-074 simplification): no re-enrollment, and skill
 *   decays by DROPOUT_SKILL_DECAY_PER_MONTH down to 0;
 * - post-graduation skill growth (+0.002/month) is an on-the-job learning
 *   abstraction, not a modeled career ladder;
 * - skill rates are flat per stage — no ability/effort/personality coupling.
 */

// ---------------------------------------------------------------------------
// Tunable constants (all named; no magic numbers in logic)
// ---------------------------------------------------------------------------

/** Age at which a person enters primary school (birthday passed). */
export const PRIMARY_ENTRY_AGE = 6
/** Age at which in_primary pupils promote to in_secondary. */
export const SECONDARY_ENTRY_AGE = 12
/** Age from which in_secondary pupils sit the graduation roll. */
export const SECONDARY_GRADUATION_AGE = 18
/** Age from which in_tertiary students sit the graduation roll. */
export const TERTIARY_GRADUATION_AGE = 22

/** Monthly probability of graduating secondary at age >= 18. */
export const SECONDARY_GRADUATION_PROBABILITY = 0.85
/** Probability that a fresh secondary graduate continues into tertiary. */
export const TERTIARY_ENTRY_PROBABILITY = 0.4
/** Monthly probability of graduating tertiary at age >= 22. */
export const TERTIARY_GRADUATION_PROBABILITY = 0.75

/** Monthly skill gains while enrolled (clamped to [0, 1]). */
export const PRIMARY_SKILL_GAIN_PER_MONTH = 0.01
export const SECONDARY_SKILL_GAIN_PER_MONTH = 0.02
export const TERTIARY_SKILL_GAIN_PER_MONTH = 0.03
/** Monthly skill gain after graduating (on-the-job learning abstraction). */
export const GRADUATE_SKILL_GAIN_PER_MONTH = 0.002
/** Monthly skill decay for dropouts (floor 0; GEN-074 simplification). */
export const DROPOUT_SKILL_DECAY_PER_MONTH = 0.001

/** Adults start at 18 (matches lifeStageFor in the canonical schema). */
const ADULT_AGE = 18

function clampSkill(skill: number): number {
  if (!Number.isFinite(skill)) return 0
  return skill < 0 ? 0 : skill > 1 ? 1 : skill
}

function isEnrolled(attainment: Attainment): boolean {
  return attainment === 'in_primary' || attainment === 'in_secondary' || attainment === 'in_tertiary'
}

// ---------------------------------------------------------------------------
// Enrollment (deterministic; no RNG draws)
// ---------------------------------------------------------------------------

/**
 * Monthly school-age assignments:
 * - alive persons aged >= 6 with no record (or an externally created
 *   'pre_school' record) enroll into 'in_primary' ('education.enrolled',
 *   payload {stage:'primary'});
 * - in_primary pupils aged >= 12 promote to 'in_secondary'
 *   ('education.enrolled', payload {stage:'secondary'}).
 */
export function schoolAgeAssignments(ctx: SimContext): void {
  const tick = ctx.tick()
  const records = ensureRecords(ctx)
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const age = ageYears(person.birthTick, tick)
    const record = records.get(person.id)
    if (record === undefined || record.attainment === 'pre_school') {
      if (age >= PRIMARY_ENTRY_AGE) {
        const enrolled: EducationRecord = {
          personId: person.id,
          attainment: 'in_primary',
          skill: 0,
          droppedOut: false
        }
        records.set(person.id, enrolled)
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'education.enrolled',
          tick,
          actorIds: [person.id],
          payload: { stage: 'primary' }
        })
      }
      continue
    }
    if (record.attainment === 'in_primary' && !record.droppedOut && age >= SECONDARY_ENTRY_AGE) {
      record.attainment = 'in_secondary'
      ctx.events.emit({
        id: ctx.ids.next('event'),
        type: 'education.enrolled',
        tick,
        actorIds: [person.id],
        payload: { stage: 'secondary' }
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Monthly progression (graduation / dropout rolls + skill update)
// ---------------------------------------------------------------------------

/**
 * Apply the monthly skill delta for the state the person is in AFTER this
 * run's transitions (post-state rule): in-school gains by stage, graduates
 * gain the small on-the-job rate, dropouts decay toward 0.
 */
function applyMonthlySkillDelta(
  record: EducationRecord,
  rateModifier: number
): void {
  if (record.droppedOut) {
    record.skill = clampSkill(record.skill - DROPOUT_SKILL_DECAY_PER_MONTH)
    return
  }
  // school-quality style modifier scales IN-SCHOOL gains only (clamped
  // [0.5, 2], mirroring the economy multiplier contract); graduates and
  // dropouts follow the fixed legacy rates. No new rng draws — the modifier
  // is deterministic per (deps, person), preserving draw sequences.
  const inSchoolGain = (base: number): number => base * Math.min(2, Math.max(0.5, rateModifier))
  switch (record.attainment) {
    case 'in_primary':
      record.skill = clampSkill(record.skill + inSchoolGain(PRIMARY_SKILL_GAIN_PER_MONTH))
      break
    case 'in_secondary':
      record.skill = clampSkill(record.skill + inSchoolGain(SECONDARY_SKILL_GAIN_PER_MONTH))
      break
    case 'in_tertiary':
      record.skill = clampSkill(record.skill + inSchoolGain(TERTIARY_SKILL_GAIN_PER_MONTH))
      break
    case 'secondary':
    case 'tertiary':
      record.skill = clampSkill(record.skill + GRADUATE_SKILL_GAIN_PER_MONTH)
      break
    case 'pre_school':
      break // not schooling yet: no growth, no decay
  }
}

/**
 * Monthly progression for alive, non-dropout record holders, in world order:
 * - in_secondary aged >= 18: graduate with p=0.85 → 'secondary'
 *   ('education.completed', stage 'secondary'); a fresh graduate continues to
 *   'in_tertiary' with p=0.4. Otherwise droppedOut=true
 *   ('education.dropped_out', stage 'secondary').
 * - in_tertiary aged >= 22: graduate with p=0.75 → 'tertiary'
 *   ('education.completed', stage 'tertiary'), otherwise droppedOut=true
 *   ('education.dropped_out', stage 'tertiary').
 * Every processed person then receives the monthly skill delta of their
 * post-transition state.
 */
export function monthlyProgress(ctx: SimContext, deps?: EducationDeps): void {
  const rateFor = (ctx: SimContext, personId: string): number => deps?.skillRateModifier?.(ctx, personId) ?? 1
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`education:${tick}`)
  const records = ensureRecords(ctx)
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const record = records.get(person.id)
    if (record === undefined || record.droppedOut) continue
    const age = ageYears(person.birthTick, tick)

    if (record.attainment === 'in_secondary' && age >= SECONDARY_GRADUATION_AGE) {
      if (rng.bool(SECONDARY_GRADUATION_PROBABILITY)) {
        record.attainment = 'secondary'
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'education.completed',
          tick,
          actorIds: [person.id],
          payload: { stage: 'secondary' }
        })
        if (rng.bool(TERTIARY_ENTRY_PROBABILITY)) record.attainment = 'in_tertiary'
      } else {
        record.droppedOut = true
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'education.dropped_out',
          tick,
          actorIds: [person.id],
          payload: { stage: 'secondary' }
        })
      }
    } else if (record.attainment === 'in_tertiary' && age >= TERTIARY_GRADUATION_AGE) {
      if (rng.bool(TERTIARY_GRADUATION_PROBABILITY)) {
        record.attainment = 'tertiary'
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'education.completed',
          tick,
          actorIds: [person.id],
          payload: { stage: 'tertiary' }
        })
      } else {
        record.droppedOut = true
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'education.dropped_out',
          tick,
          actorIds: [person.id],
          payload: { stage: 'tertiary' }
        })
      }
    }

    applyMonthlySkillDelta(record, rateFor(ctx, record.personId))
  }
}

// ---------------------------------------------------------------------------
// World-level gauges
// ---------------------------------------------------------------------------

/**
 * Record the education gauges (deterministic; observe the post-progress state):
 * - education_in_school:      alive persons currently enrolled
 *                             (in_* attainment, not dropped out);
 * - education_secondary_plus: share of alive ADULTS (age >= 18) whose
 *                             attainment is 'secondary' or 'tertiary';
 * - education_dropout_rate:   droppedOut records / records ever created
 *                             (denominator includes dead residents — the
 *                             side table keeps historical records);
 * - education_mean_skill:     mean skill over all records (sorted-key
 *                             iteration keeps the float sum deterministic).
 */
export function educationMetrics(ctx: SimContext): void {
  const tick = ctx.tick()
  const records = ensureRecords(ctx)

  let inSchool = 0
  let adults = 0
  let secondaryPlus = 0
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const record = records.get(person.id)
    if (record !== undefined && !record.droppedOut && isEnrolled(record.attainment)) inSchool++
    if (ageYears(person.birthTick, tick) >= ADULT_AGE) {
      adults++
      if (record !== undefined && (record.attainment === 'secondary' || record.attainment === 'tertiary')) {
        secondaryPlus++
      }
    }
  }

  let dropouts = 0
  let skillSum = 0
  const entries = [...records.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  for (const [, record] of entries) {
    if (record.droppedOut) dropouts++
    skillSum += record.skill
  }
  const tracked = entries.length

  ctx.metrics.gauge('education_in_school', inSchool)
  ctx.metrics.gauge('education_secondary_plus', adults === 0 ? 0 : secondaryPlus / adults)
  ctx.metrics.gauge('education_dropout_rate', tracked === 0 ? 0 : dropouts / tracked)
  ctx.metrics.gauge('education_mean_skill', tracked === 0 ? 0 : skillSum / tracked)
}
