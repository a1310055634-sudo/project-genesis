import { clamp01 } from './util'
import { ensureUnits, rentShareOf } from './housing'
import { Person, SimContext } from '@genesis/simulation'

/** Baseline burden for households without an assigned unit yet (edge case). */
export const HOUSING_BASELINE_BURDEN = 0.2

/**
 * Housing burden for one person: their equal share of the household rent
 * divided by the household primary income, clamped [0, 1]. Households without
 * an assigned unit (edge cases: brand-new between monthly runs) return the
 * documented baseline.
 */
export function housingBurdenOf(ctx: SimContext, person: Person): number {
  if (person.householdId === null) return HOUSING_BASELINE_BURDEN
  const units = ensureUnits(ctx)
  const unit = units.get(person.householdId)
  if (unit === undefined) return HOUSING_BASELINE_BURDEN
  const household = ctx.world.households.find((h) => h.id === person.householdId)
  if (household === undefined) return HOUSING_BASELINE_BURDEN
  const aliveMembers = household.memberIds
    .map((id) => ctx.world.persons.find((p) => p.id === id))
    .filter((p) => p !== undefined && p.alive)
  const primary = aliveMembers[0]
  const income = Math.max(1, primary?.economy.monthlyIncomeCents ?? 1)
  return clamp01(rentShareOf(unit, aliveMembers.length) / income)
}
