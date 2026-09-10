import { clamp01 } from './util'
import { assignUnit, ensureUnits } from './housing'
import { GenesisSystem, nextMonthStart, SimContext } from '@genesis/simulation'

/**
 * Monthly housing system (priority 13 — after family(12), before education(14)):
 * 1. assign units to households that appeared since last month (marriage,
 *    divorce moves);
 * 2. drop units of households removed by the family GC (empty shells);
 * 3. record burden metrics (rent share / primary income per alive household).
 *
 * v1: rent is a burden INDICATOR (no money flow — see housing.ts doc).
 * `costMultiplier` is the EXP-004 scenario knob (config.housingCostMultiplier).
 */
export const housingSystem = (): GenesisSystem => ({
  id: 'housing',
  priority: 13,
  nextFireTick: nextMonthStart,
  run(ctx: SimContext) {
    const units = ensureUnits(ctx)
    // EXP-004 scenario knob lives in config so experiment arms can override it.
    // NO clamp here (red team RT4-01): the [0.1, 5] domain is enforced by
    // normalizeConfig; clamp01 silently collapsed every multiplier >1 to 1,
    // turning the EXP-004 treatment arm into a no-op.
    const multiplier = ctx.config.housingCostMultiplier

    // 1) assign units to not-yet-housed non-empty households
    for (const household of ctx.world.households) {
      if (household.memberIds.length === 0) continue
      if (units.has(household.id)) continue
      assignUnit(ctx, household.id, household.memberIds.length, multiplier)
    }

    // 2) drop units of dead (empty) households — family GC removed them from
    //    world.households; their units are now orphans
    const alive = new Set(ctx.world.households.map((h) => h.id))
    for (const householdId of [...units.keys()]) {
      if (!alive.has(householdId)) units.delete(householdId)
    }

    // 3) metrics: mean rent burden across alive households
    const householdById = new Map(ctx.world.households.map((h) => [h.id, h]))
    const personById = new Map(ctx.world.persons.map((p) => [p.id, p]))
    let burdenSum = 0
    let burdenCount = 0
    let crowded = 0
    let crowdedPossible = 0
    for (const [householdId, unit] of units) {
      const household = householdById.get(householdId)
      if (household === undefined) continue
      const aliveMembers = household.memberIds
        .map((id) => personById.get(id))
        .filter((p) => p !== undefined && p.alive)
      if (aliveMembers.length === 0) continue
      const primary = aliveMembers[0] as NonNullable<(typeof aliveMembers)[number]>
      const income = Math.max(1, primary.economy.monthlyIncomeCents)
      const burden = clamp01(unit.monthlyRentCents / aliveMembers.length / income)
      burdenSum += burden
      burdenCount++
      if (aliveMembers.length >= 2) {
        crowdedPossible++
        if (aliveMembers.length >= 4) crowded++
      }
    }
    ctx.metrics.gauge('housing_mean_burden', burdenCount === 0 ? 0 : burdenSum / burdenCount)
    ctx.metrics.gauge('housing_crowded_share', crowdedPossible === 0 ? 0 : crowded / crowdedPossible)
  }
})
