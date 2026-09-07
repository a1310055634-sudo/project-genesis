import { SimContext } from '@genesis/simulation'

/**
 * Education domain data types (HT-12, GEN-074 dropout simplification).
 *
 * DESIGN DECISION (Director, HT-12): EducationRecord deliberately stays OUT of
 * the canonical Person schema. Records live in `ctx.extensions` under the
 * EDUCATION_RECORDS key as a Map<string, EducationRecord> keyed by personId.
 *
 * Rationale: education is an experimental domain and lands as a SIDE TABLE
 * first; it can be promoted to canonical schema fields once @genesis/economy
 * actually consumes skill for the wage coupling. Consequence (recorded):
 * education state is not part of Simulation.digest() replays — its
 * determinism is guaranteed by the same seed/config determinism of the
 * systems that write it and verified independently in the package tests.
 * The side table lives and dies with its Simulation instance: it is stored
 * per-context (never module-global), mirroring the economy consumption
 * accumulator precedent (packages/economy/src/flows.ts).
 */

export type Attainment =
  | 'pre_school'
  | 'in_primary'
  | 'in_secondary'
  | 'in_tertiary'
  | 'primary'
  | 'secondary'
  | 'tertiary'

export interface EducationRecord {
  personId: string
  attainment: Attainment
  /** Skill proxy in [0, 1]; the future coupling point for economy wages. */
  skill: number
  /** True once the person left school without graduating (terminal in v1). */
  droppedOut: boolean
}

/** `ctx.extensions` key under which the education records map is stored. */
export const EDUCATION_RECORDS = 'education.records'

/**
 * Get (or lazily create) the per-simulation education records side table.
 * The map is keyed by personId; entries are created on primary enrollment and
 * never deleted (dead residents keep their historical record).
 */
export function ensureRecords(ctx: SimContext): Map<string, EducationRecord> {
  let records = ctx.extensions.get(EDUCATION_RECORDS) as Map<string, EducationRecord> | undefined
  if (records === undefined) {
    records = new Map<string, EducationRecord>()
    ctx.extensions.set(EDUCATION_RECORDS, records)
  }
  return records
}
