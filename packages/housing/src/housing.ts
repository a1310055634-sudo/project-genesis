import { clamp01 } from './util'

/**
 * Housing domain (HT-12 Housing, GEN-004 pre-work): side-table design mirroring
 * education — `housing.units` lives in ctx.extensions (Map keyed by
 * householdId), NOT in the canonical schema. Promoted to schema only if a
 * future domain needs housing units as first-class entities.
 *
 * v1 model (recorded simplifications):
 * - Rent is a DERIVED BURDEN INDICATOR, not an actual money flow: the
 *   economy's daily consumption already approximates housing costs, so
 *   charging rent here would double-spend. The burden metric prices the
 *   household's rent share explicitly for the psychology pathway.
 * - Quality is static after assignment (no maintenance/decay loop yet).
 * - Crowding = household members (v1 has no room count).
 */

export const HOUSING_UNITS = 'housing.units'

export interface HousingUnit {
  householdId: string
  /** [0, 1] — location+build quality. */
  quality: number
  /** Monthly rent in integer cents. */
  monthlyRentCents: number
}

export function ensureUnits(ctx: import('@genesis/simulation').SimContext): Map<string, HousingUnit> {
  const existing = ctx.extensions.get(HOUSING_UNITS)
  if (existing instanceof Map) return existing as Map<string, HousingUnit>
  const created = new Map<string, HousingUnit>()
  ctx.extensions.set(HOUSING_UNITS, created)
  return created
}

/** Base monthly rent for a single-member household, integer cents (v1 constant). */
export const HOUSING_BASE_RENT_CENTS = 40_000
/** Per additional member increment, integer cents. */
export const HOUSING_MEMBER_RENT_CENTS = 20_000

/**
 * Rent formula (single source of truth, used by both assignment and monthly
 * repricing): size component × cost multiplier × QUALITY DESIRABILITY FACTOR
 * (0.5 + quality — a 0.3-quality unit rents at 80%, a 0.9-quality at 140%).
 * Quality was previously write-only (red team RT4-05); this wires it into the
 * burden→strain pathway so EXP-004 measures real quality differences.
 */
export function computeRent(memberCount: number, costMultiplier: number, quality: number): number {
  return Math.round(
    (HOUSING_BASE_RENT_CENTS + HOUSING_MEMBER_RENT_CENTS * Math.max(0, memberCount - 1)) *
      costMultiplier *
      (0.5 + quality)
  )
}

/** Housing cost scenario knob multiplier is applied by the caller (config.housingCostMultiplier). */
export function assignUnit(
  ctx: import('@genesis/simulation').SimContext,
  householdId: string,
  memberCount: number,
  costMultiplier: number
): HousingUnit {
  const units = ensureUnits(ctx)
  const rng = ctx.rng.fork(`housing:${householdId}`)
  const quality = 0.3 + rng.next() * 0.6
  // NO clamp on costMultiplier (red team RT4-01): domain [0.1, 5] enforced by
  // normalizeConfig; clamping here silently voided the EXP-004 treatment arm
  const rent = computeRent(memberCount, costMultiplier, quality)
  const unit: HousingUnit = { householdId, quality, monthlyRentCents: rent }
  units.set(householdId, unit)
  return unit
}

/** Per-capita rent share across alive members (v1). */
export function rentShareOf(unit: HousingUnit, aliveMembers: number): number {
  if (aliveMembers <= 0) return unit.monthlyRentCents
  return Math.round(unit.monthlyRentCents / aliveMembers)
}
