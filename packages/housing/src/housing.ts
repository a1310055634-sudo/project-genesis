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
  const rent = Math.round(
    (HOUSING_BASE_RENT_CENTS + HOUSING_MEMBER_RENT_CENTS * Math.max(0, memberCount - 1)) * clamp01(costMultiplier)
  )
  const unit: HousingUnit = { householdId, quality, monthlyRentCents: rent }
  units.set(householdId, unit)
  return unit
}

/** Primary earner's share of rent: equal split across alive members (v1). */
export function rentShareOf(unit: HousingUnit, aliveMembers: number): number {
  if (aliveMembers <= 0) return unit.monthlyRentCents
  return Math.round(unit.monthlyRentCents / aliveMembers)
}
