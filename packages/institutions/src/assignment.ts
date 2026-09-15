import { GenesisSystem, nextMonthStart, SimContext } from '@genesis/simulation'
import {
  ASSIGNMENTS,
  buildSchools,
  ensureAssignments,
  ensureSchools,
  OVERFLOW_SCHOOL_ID,
  PUPILS_PER_SCHOOL,
  SCHOOL_CROWD_PENALTY_PER_MONTH,
  SCHOOL_FUNDING_PER_PUPIL_CENTS,
  SCHOOL_QUALITY_DRIFT_PER_MONTH,
  SCHOOL_QUALITY_RANGE
} from './schools'

/**
 * Monthly school assignment (priority 14 — same band as education, registered
 * after it so assignment follows progression): every pupil aged 6..17 without
 * an assignment gets the first school with free capacity (id order); if all
 * are full, the virtual overflow school takes them (documented simplification).
 * Assignments are revoked when the pupil ages out (18+) or dies.
 */
export function monthlySchoolAssignment(ctx: SimContext): void {
  const tick = ctx.tick()
  buildSchools(ctx)
  const schools = ensureSchools(ctx)
  const assignments = ensureAssignments(ctx)
  // red team RT5-05: build the person index and the sorted school list ONCE
  // per run instead of per assignment/per pupil
  const personsById = new Map(ctx.world.persons.map((p) => [p.id, p]))
  const sortedSchools = [...schools.values()].sort((x, y) => (x.schoolId < y.schoolId ? -1 : 1))

  const filled = new Map<string, number>()
  for (const school of schools.values()) filled.set(school.schoolId, 0)

  // age-out / death revocation
  for (const [pupilId, assignment] of [...assignments.entries()]) {
    const person = personsById.get(pupilId)
    if (person === undefined || !person.alive || (tick - person.birthTick) / 8640 >= 18) {
      assignments.delete(pupilId)
    }
  }

  // recount occupancy from live assignments (source of truth = assignments map)
  filled.clear()
  for (const assignment of assignments.values()) {
    if (assignment.schoolId !== OVERFLOW_SCHOOL_ID) {
      filled.set(assignment.schoolId, (filled.get(assignment.schoolId) ?? 0) + 1)
    }
  }

  // new pupils: 6..17 years old, no assignment
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const age = (tick - person.birthTick) / 8640
    if (age < 6 || age >= 18) continue
    if (assignments.has(person.id)) continue

    let placed = false
    for (const school of sortedSchools) {
      const used = filled.get(school.schoolId) ?? 0
      if (used < school.capacity) {
        assignments.set(person.id, { schoolId: school.schoolId, isOverflow: false })
        filled.set(school.schoolId, used + 1)
        placed = true
        break
      }
    }
    if (!placed) {
      assignments.set(person.id, { schoolId: OVERFLOW_SCHOOL_ID, isOverflow: true })
    }
  }

  // overflow re-placement (red team RT5-03): pupils stuck in the virtual
  // overflow school migrate into real schools as capacity frees up — id order
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const age = (tick - person.birthTick) / 8640
    if (age < 6 || age >= 18) continue
    const assignment = assignments.get(person.id)
    if (assignment === undefined || !assignment.isOverflow) continue
    for (const school of sortedSchools) {
      const used = filled.get(school.schoolId) ?? 0
      if (used < school.capacity) {
        assignments.set(person.id, { schoolId: school.schoolId, isOverflow: false })
        filled.set(school.schoolId, used + 1)
        break
      }
    }
  }

  // metrics
  let assigned = 0
  let overflow = 0
  for (const assignment of assignments.values()) {
    assigned++
    if (assignment.isOverflow) overflow++
  }
  ctx.metrics.gauge('institutions_pupils_assigned', assigned)
  ctx.metrics.gauge('institutions_overflow_pupils', overflow)
}

/**
 * Pupil → school quality map (red team RT4-05): lets the composition root
 * couple school quality into education's skill-rate modifier without a
 * domain→domain import. Pupils without an assignment are absent from the map.
 */
export function buildQualityByPupil(ctx: SimContext): Map<string, number> {
  const schools = ensureSchools(ctx)
  const assignments = ensureAssignments(ctx)
  const out = new Map<string, number>()
  for (const [pupilId, assignment] of assignments) {
    const school = schools.get(assignment.schoolId)
    if (school !== undefined) out.set(pupilId, school.quality)
  }
  return out
}

/** Composition-root wiring for the school funding loop (domain→domain
 * imports are forbidden, so the taxation-pool accessors from
 * @genesis/economy are injected here — same pattern as media's deps).
 * Without deps, school funding and quality drift are SKIPPED: standalone
 * institutions runs keep the build-time quality snapshot. */
export interface InstitutionsDeps {
  getTaxPool: (ctx: SimContext) => number
  setTaxPool: (ctx: SimContext, value: number) => void
}

/**
 * Monthly school funding (RT6-D1-3 follow-up / HANDOFF 住房资金循环): the bill
 * is `schoolFundingPerPupilCents × assigned pupils`, drawn from the taxation
 * pool FIRST (welfare/pension convention, RT5-01) — the shortfall is
 * deficit-created and audited. The funded ratio drives monthly quality
 * drift: full funding erodes toward the range ceiling, zero funding toward
 * the floor; crowding above the nominal PUPILS_PER_SCHOOL adds monthly
 * erosion. Integer cents throughout; deterministic.
 */
export function monthlySchoolFunding(ctx: SimContext, deps: InstitutionsDeps): void {
  const rate = ctx.config.schoolFundingPerPupilCents ?? SCHOOL_FUNDING_PER_PUPIL_CENTS
  const schools = ensureSchools(ctx)
  if (schools.size === 0) return
  const assignments = ensureAssignments(ctx)
  const filled = new Map<string, number>()
  for (const assignment of assignments.values()) {
    if (assignment.schoolId === OVERFLOW_SCHOOL_ID) continue
    filled.set(assignment.schoolId, (filled.get(assignment.schoolId) ?? 0) + 1)
  }
  let pupils = 0
  for (const n of filled.values()) pupils += n
  const bill = pupils * rate
  const pool = deps.getTaxPool(ctx)
  const paid = Math.min(pool, bill)
  deps.setTaxPool(ctx, pool - paid)
  const deficit = bill - paid
  ctx.metrics.increment('institutions.funding_paid_cents', paid)
  if (deficit > 0) {
    const key = 'institutions.funding_deficit_cents'
    ctx.metrics.gauge(key, ctx.metrics.gaugeValue(key) + deficit)
  }
  const ratio = bill > 0 ? paid / bill : 1
  ctx.metrics.gauge('institutions_funding_ratio', ratio)
  for (const school of schools.values()) {
    const crowd = Math.max(0, (filled.get(school.schoolId) ?? 0) / PUPILS_PER_SCHOOL - 1)
    school.quality = Math.min(
      SCHOOL_QUALITY_RANGE[1],
      Math.max(
        SCHOOL_QUALITY_RANGE[0],
        school.quality +
          SCHOOL_QUALITY_DRIFT_PER_MONTH * (2 * ratio - 1) -
          SCHOOL_CROWD_PENALTY_PER_MONTH * crowd
      )
    )
  }
}

export const institutionsSystem = (deps?: InstitutionsDeps): GenesisSystem => ({
  id: 'institutions',
  priority: 14,
  nextFireTick: nextMonthStart,
  run(ctx: SimContext) {
    monthlySchoolAssignment(ctx)
    if (deps !== undefined) monthlySchoolFunding(ctx, deps)
  }
})
