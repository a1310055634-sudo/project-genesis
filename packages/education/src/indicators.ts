import { SimContext } from '@genesis/simulation'
import { Attainment, EDUCATION_RECORDS, EducationRecord } from './types'

/**
 * Read-side accessors (HT-12): the future coupling point for @genesis/economy
 * wage calculations (skill → wage) once the side table is promoted. Both are
 * read-only — they do NOT lazily create the side table.
 */

/** Skill proxy in [0, 1]; 0 for persons without an education record. */
export function skillOf(ctx: SimContext, personId: string): number {
  const records = ctx.extensions.get(EDUCATION_RECORDS) as Map<string, EducationRecord> | undefined
  const record = records?.get(personId)
  return record === undefined ? 0 : record.skill
}

/** Current attainment; 'none' for persons without an education record. */
export function attainmentOf(ctx: SimContext, personId: string): Attainment | 'none' {
  const records = ctx.extensions.get(EDUCATION_RECORDS) as Map<string, EducationRecord> | undefined
  const record = records?.get(personId)
  return record === undefined ? 'none' : record.attainment
}
