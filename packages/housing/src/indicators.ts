import { ensureUnits, HousingUnit } from './housing'
import { Person, SimContext } from '@genesis/simulation'

/** Baseline burden for households without an assigned unit yet (edge case). */
export const HOUSING_BASELINE_BURDEN = 0.2

/**
 * Per-person housing burden map, computed in ONE pass over households
 * (red team RT4-02: the daily psychology path used to pay O(H + members×N)
 * per ADULT per DAY for this). Burden semantics (red team RT4-09):
 *   burden(household) = rent / SUM(alive member incomes)
 * — the true rent-to-income ratio, order-insensitive, identical for every
 * member of the same household. Households without a unit use the documented
 * baseline.
 */
export function buildHousingBurdenByPerson(ctx: SimContext): Map<string, number> {
  const units = ensureUnits(ctx)
  const personById = new Map(ctx.world.persons.map((p) => [p.id, p]))
  const burden = new Map<string, number>()
  for (const household of ctx.world.households) {
    const aliveMembers = household.memberIds
      .map((id) => personById.get(id))
      .filter((p): p is Person => p !== undefined && p.alive)
    if (aliveMembers.length === 0) continue
    const unit: HousingUnit | undefined = units.get(household.id)
    const incomeSum = aliveMembers.reduce((sum, p) => sum + Math.max(1, p.economy.monthlyIncomeCents), 0)
    let householdBurden = HOUSING_BASELINE_BURDEN
    if (unit !== undefined) {
      householdBurden = Math.min(1, unit.monthlyRentCents / Math.max(1, incomeSum))
    }
    for (const member of aliveMembers) burden.set(member.id, householdBurden)
  }
  return burden
}

/** Point lookup for one person (O(H+members) — use the map form on hot paths). */
export function housingBurdenOf(ctx: SimContext, person: Person): number {
  const map = buildHousingBurdenByPerson(ctx)
  return map.get(person.id) ?? HOUSING_BASELINE_BURDEN
}
