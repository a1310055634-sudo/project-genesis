import { GenesisSystem, SimContext } from '@genesis/simulation'

/**
 * Institutions domain (HT-12 Institutions) — schools first.
 *
 * Side-table design (mirrors education/housing): school entities and pupil
 * assignments live in ctx.extensions ('institutions.schools' /
 * 'institutions.assignments'), NOT in the canonical schema.
 *
 * v1 simplifications (recorded):
 * - schools have capacity + quality only (no teachers, no budgets);
 * - assignment is deterministic nearest-capacity fill in id order;
 * - overflow pupils attend a virtual uncap'd school (documented);
 * - school quality is static (no funding/decay loop yet).
 */

export const SCHOOLS = 'institutions.schools'
export const ASSIGNMENTS = 'institutions.assignments'

export interface School {
  schoolId: string
  name: string
  capacity: number
  quality: number
}

export interface Assignment {
  schoolId: string
  /** Virtual overflow school: pupils beyond all capacity. */
  isOverflow: boolean
}

export function ensureSchools(ctx: SimContext): Map<string, School> {
  const existing = ctx.extensions.get(SCHOOLS)
  if (existing instanceof Map) return existing as Map<string, School>
  const created = new Map<string, School>()
  ctx.extensions.set(SCHOOLS, created)
  return created
}

export function ensureAssignments(ctx: SimContext): Map<string, Assignment> {
  const existing = ctx.extensions.get(ASSIGNMENTS)
  if (existing instanceof Map) return existing as Map<string, Assignment>
  const created = new Map<string, Assignment>()
  ctx.extensions.set(ASSIGNMENTS, created)
  return created
}

export const SCHOOLS_TARGET = 3
export const SCHOOL_CAPACITY = 40
export const SCHOOL_QUALITY_RANGE: [number, number] = [0.35, 0.85]

/** Build SCHO_TARGET schools with deterministic capacity/quality. */
export function buildSchools(ctx: SimContext): void {
  const schools = ensureSchools(ctx)
  if (schools.size > 0) return
  const rng = ctx.rng.fork('institutions:schools')
  for (let i = 0; i < SCHOOLS_TARGET; i++) {
    const schoolId = ctx.ids.next('school')
    schools.set(schoolId, {
      schoolId,
      name: `School-${i + 1}`,
      capacity: SCHOOL_CAPACITY,
      quality: SCHOOL_QUALITY_RANGE[0] + rng.next() * (SCHOOL_QUALITY_RANGE[1] - SCHOOL_QUALITY_RANGE[0])
    })
  }
}

/** The virtual overflow school (uncapped, documented simplification). */
export const OVERFLOW_SCHOOL_ID = 'school-overflow'
