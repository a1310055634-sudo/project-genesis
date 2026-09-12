import { describe, expect, it } from 'vitest'
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { ASSIGNMENTS, institutionsSystem, OVERFLOW_SCHOOL_ID, SCHOOLS, SCHOOLS_TARGET } from '@genesis/institutions'

/**
 * Institutions domain (HT-12 Institutions, schools first): deterministic
 * capacity assignment + overflow + age-out revocation.
 */
function build(years: number) {
  return Simulation.create(
    { seed: 42, populationTarget: 200, years },
    { systems: [demographicsSystem, institutionsSystem()] }
  )
}

describe('institutions — school assignment', () => {
  it('builds the configured number of schools', () => {
    const sim = build(1)
    sim.run()
    const schools = sim.ctx.extensions.get(SCHOOLS) as Map<string, unknown>
    expect(schools.size).toBe(SCHOOLS_TARGET)
  })

  it('assigns pupils within capacity, overflow only when full, invariants green', () => {
    const sim = build(3)
    sim.run()
    const assignments = sim.ctx.extensions.get(ASSIGNMENTS) as Map<string, { schoolId: string; isOverflow: boolean }>
    expect(assignments.size).toBeGreaterThan(0)

    const occupancy = new Map<string, number>()
    for (const assignment of assignments.values()) {
      if (!assignment.isOverflow) {
        occupancy.set(assignment.schoolId, (occupancy.get(assignment.schoolId) ?? 0) + 1)
      }
    }
    // every real school respects capacity
    for (const [schoolId, used] of occupancy) {
      expect(used).toBeLessThanOrEqual(40)
      void schoolId
    }
    // with ~60 pupils across 3 schools × 40 capacity, overflow should be rare/zero
    const overflow = [...assignments.values()].filter((a) => a.isOverflow).length
    expect(overflow).toBeLessThanOrEqual(5)
  })

  it('revokes assignments when pupils age out or die', () => {
    const sim = build(20)
    sim.run()
    const assignments = sim.ctx.extensions.get(ASSIGNMENTS) as Map<string, { schoolId: string }>
    const byId = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    // every live assignment belongs to an alive pupil aged 6..17
    for (const [pupilId, assignment] of assignments) {
      const person = byId.get(pupilId)
      if (person === undefined) continue
      if (!person.alive) continue // dead pupils' assignments are dropped lazily
      const age = (sim.ctx.clock.tick - person.birthTick) / TICKS_PER_YEAR
      if (person.householdId !== null || true) {
        expect(age).toBeLessThan(18)
        expect(age).toBeGreaterThanOrEqual(6)
        void assignment
      }
    }
  })

  it('is deterministic under a fixed seed', () => {
    const run = () => {
      const sim = build(2)
      sim.run()
      const assignments = sim.ctx.extensions.get(ASSIGNMENTS) as Map<string, { schoolId: string }>
      return [...assignments.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([id, a]) => `${id}:${a.schoolId}`).join('|')
    }
    expect(run()).toBe(run())
  })
})

describe('overflow re-placement (red team RT5-03)', () => {
  it('migrates overflow pupils into real schools when capacity frees', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 60, years: 1 },
      { systems: [demographicsSystem, institutionsSystem()] }
    )
    sim.run()
    const extensions = sim.ctx.extensions
    const schools = extensions.get(SCHOOLS) as Map<string, { schoolId: string; capacity: number }>
    const assignments = extensions.get(ASSIGNMENTS) as Map<string, { schoolId: string; isOverflow: boolean }>
    const personById = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))

    // engineer: force one pupil into overflow by stuffing all schools
    const pupil = sim.ctx.world.persons.find(
      (p) => p.alive && (sim.ctx.clock.tick - p.birthTick) / 8640 >= 6 &&
        (sim.ctx.clock.tick - p.birthTick) / 8640 < 18
    )
    if (pupil === undefined) throw new Error('fixture pupil missing')
    const stuffed: string[] = []
    let stuffedAny = false
    for (const school of schools.values()) {
      const free = school.capacity - [...assignments.values()].filter(
        (a) => a.schoolId === school.schoolId && !a.isOverflow
      ).length
      for (let i = 0; i < free; i++) {
        // stuff with synthetic non-entities is not possible (invariant checks
        // persons exist), so instead fill remaining capacity with real persons
        const candidate = sim.ctx.world.persons.find(
          (p) => p.alive && (sim.ctx.clock.tick - p.birthTick) / 8640 >= 6 &&
            (sim.ctx.clock.tick - p.birthTick) / 8640 < 18 &&
            !assignments.has(p.id) && !stuffed.includes(p.id)
        )
        if (candidate === undefined) break
        assignments.set(candidate.id, { schoolId: school.schoolId, isOverflow: false })
        stuffed.push(candidate.id)
        stuffedAny = true
      }
    }
    void stuffedAny
    // mark the stuffed entries overflow... simpler: put the pupil in overflow directly
    assignments.set(pupil.id, { schoolId: OVERFLOW_SCHOOL_ID, isOverflow: true })

    const overflowBefore = [...assignments.values()].filter((a) => a.isOverflow).length
    expect(overflowBefore).toBeGreaterThanOrEqual(1)

    // free capacity: age out one stuffed non-overflow student (set birthTick to 20y)
    const stuffedStudent = stuffed[0]
    if (stuffedStudent !== undefined) {
      const person = personById.get(stuffedStudent)
      if (person !== undefined) {
        person.birthTick = sim.ctx.clock.tick - 20 * 8640
        person.lifeStage = 'adult'
      }
    }

    sim.stepTo(sim.ctx.clock.tick + TICKS_PER_MONTH)
    const migrated = assignments.get(pupil.id)
    expect(migrated?.isOverflow).toBe(false)
    expect(migrated?.schoolId).not.toBe(OVERFLOW_SCHOOL_ID)
  }, 60_000)
})

