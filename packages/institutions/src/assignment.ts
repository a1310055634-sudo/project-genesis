import { GenesisSystem, nextMonthStart, SimContext } from '@genesis/simulation'
import { ASSIGNMENTS, buildSchools, ensureAssignments, ensureSchools, OVERFLOW_SCHOOL_ID } from './schools'

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

  const filled = new Map<string, number>()
  for (const school of schools.values()) filled.set(school.schoolId, 0)

  // age-out / death revocation
  for (const [pupilId, assignment] of [...assignments.entries()]) {
    const person = ctx.world.persons.find((p) => p.id === pupilId)
    if (person === undefined || !person.alive || (tick - person.birthTick) / 8640 >= 18) {
      assignments.delete(pupilId)
      if (assignment.schoolId !== OVERFLOW_SCHOOL_ID) {
        const school = schools.get(assignment.schoolId)
        if (school !== undefined) filled.set(assignment.schoolId, Math.max(0, (filled.get(assignment.schoolId) ?? 0) - 1))
      }
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
    for (const school of [...schools.values()].sort((x, y) => (x.schoolId < y.schoolId ? -1 : 1))) {
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

export const institutionsSystem = (): GenesisSystem => ({
  id: 'institutions',
  priority: 14,
  nextFireTick: nextMonthStart,
  run(ctx: SimContext) {
    monthlySchoolAssignment(ctx)
  }
})
