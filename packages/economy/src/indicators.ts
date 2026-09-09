import { ageYears } from '@genesis/core'
import { scaleMoney } from '@genesis/shared'
import { Person, SimContext } from '@genesis/simulation'

/**
 * Economy indicators (GEN-027): financial strain per person and world-level
 * metrics gauges. All values are derived deterministically from world state.
 */

// ---------------------------------------------------------------------------
// Financial strain
// ---------------------------------------------------------------------------

/** Strain level for a person with no job (v1: flat, wealth-independent). */
export const STRAIN_UNEMPLOYED = 0.85
/** Runway (in months) at which an employed person's strain reaches 0. */
export const STRAIN_RUNWAY_HORIZON_MONTHS = 12
/** Floor on estimated monthly burn so the runway ratio stays finite (cents, ~$450). */
export const STRAIN_MIN_MONTHLY_BURN_CENTS = 45_000
/**
 * Fallback burn estimate as a share of monthly income, used while
 * lastMonthConsumptionCents has no history yet (matches the ~60% implied
 * consumption rate of the daily consumption flow).
 */
export const STRAIN_INCOME_BURN_SHARE = 0.6

/**
 * Financial strain in [0, 1] (higher = worse).
 *
 * Formula:
 * - unemployed (employerId === null): STRAIN_UNEMPLOYED (0.85).
 * - employed: runway = wealthCents / max(lastMonthConsumptionCents,
 *   STRAIN_INCOME_BURN_SHARE * monthlyIncomeCents, STRAIN_MIN_MONTHLY_BURN_CENTS);
 *   strain = STRAIN_UNEMPLOYED * (1 - min(runway, HORIZON) / HORIZON),
 *   clamped to [0, 1]. Zero runway (no savings) → 0.85; runway ≥ 12 months → 0.
 */
export function financialStrainOf(person: Person): number {
  const economy = person.economy
  if (economy.employerId === null) {
    // welfare softens the unemployed floor (EXP-030): each 125k cents/month
    // of transfer income removes 0.1 of strain, floored at 0.45
    const welfare = Math.max(0, economy.monthlyIncomeCents)
    const relief = 0.1 * Math.floor(welfare / 125_000)
    return Math.min(1, Math.max(0, STRAIN_UNEMPLOYED - relief))
  }
  const incomeBurn = scaleMoney(economy.monthlyIncomeCents, STRAIN_INCOME_BURN_SHARE, 'floor')
  const monthlyBurn = Math.max(STRAIN_MIN_MONTHLY_BURN_CENTS, economy.lastMonthConsumptionCents, incomeBurn)
  const runwayMonths = Math.max(0, economy.wealthCents) / monthlyBurn
  const strain = STRAIN_UNEMPLOYED * (1 - Math.min(runwayMonths, STRAIN_RUNWAY_HORIZON_MONTHS) / STRAIN_RUNWAY_HORIZON_MONTHS)
  return Math.min(1, Math.max(0, strain))
}

// ---------------------------------------------------------------------------
// World-level metrics
// ---------------------------------------------------------------------------

/** Working-age bounds for the employment-rate denominator (matches lifeStageFor). */
const WORKING_AGE_MIN = 18
const RETIREMENT_AGE = 65

/**
 * Record economy gauges on the metrics registry:
 * - employment_rate: share of alive adults (age 18..64) holding a job;
 * - mean_income: mean MONTHLY income of employed persons, in CENTS;
 * - mean_wealth: mean wealth of all alive persons, in CENTS;
 * - wealth_gini: Gini coefficient of wealth across alive persons,
 *   G = 2 * Σ(i * w_i) / (n * Σw) - (n + 1) / n  (w ascending, i = 1..n;
 *   G = 0 when Σw = 0), clamped to [0, 1].
 * Also records per-employed-person 'income' samples for distribution stats.
 */
export function recordEconomyMetrics(ctx: SimContext): void {
  const tick = ctx.tick()
  let adults = 0
  let employed = 0
  let incomeSumCents = 0
  let wealthSumCents = 0
  const wealths: number[] = []

  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    wealths.push(person.economy.wealthCents)
    wealthSumCents += person.economy.wealthCents
    const age = ageYears(person.birthTick, tick)
    if (age >= WORKING_AGE_MIN && age < RETIREMENT_AGE) {
      adults++
      if (person.economy.employerId !== null) {
        employed++
        incomeSumCents += person.economy.monthlyIncomeCents
        ctx.metrics.record('income', person.economy.monthlyIncomeCents)
      }
    }
  }

  const aliveCount = wealths.length
  ctx.metrics.gauge('employment_rate', adults === 0 ? 0 : employed / adults)
  ctx.metrics.gauge('mean_income', employed === 0 ? 0 : incomeSumCents / employed)
  ctx.metrics.gauge('mean_wealth', aliveCount === 0 ? 0 : wealthSumCents / aliveCount)
  ctx.metrics.gauge('wealth_gini', wealthGini(wealths))
  ctx.metrics.increment('economy.metrics_runs')
}

/** Gini coefficient of a non-negative sample (see recordEconomyMetrics). */
export function wealthGini(wealths: number[]): number {
  const n = wealths.length
  if (n === 0) return 0
  let total = 0
  for (const w of wealths) total += w
  if (total <= 0) return 0
  const sorted = [...wealths].sort((a, b) => a - b)
  let weighted = 0
  for (let i = 0; i < n; i++) weighted += (i + 1) * (sorted[i] as number)
  const gini = (2 * weighted) / (n * total) - (n + 1) / n
  return Math.min(1, Math.max(0, gini))
}
