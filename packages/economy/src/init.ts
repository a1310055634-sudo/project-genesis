import { Rng } from '@genesis/core'
import { cents } from '@genesis/shared'
import { EconomyState } from '@genesis/simulation'

/**
 * Initial economy state factory (v1: used by tests and future re-generation;
 * the population generator seeds wealth structurally on its own).
 *
 * Age curve (recorded simplification): mean savings grow linearly with age —
 *   meanWealthCents(age) = BASE_WEALTH_CENTS + age * WEALTH_PER_AGE_YEAR_CENTS
 * with multiplicative noise in [1 - SPREAD, 1 + SPREAD] drawn from `rng`.
 * Employment/income are NOT set here: job assignment is the job market's job.
 */

/** Mean savings at age 0, cents (~$200). */
const BASE_WEALTH_CENTS = 20_000
/** Mean savings added per year of age, cents (~$2,000/year). */
const WEALTH_PER_AGE_YEAR_CENTS = 200_000
/** Half-spread of the multiplicative noise: wealth = mean * (1 ± 0.2). */
const WEALTH_NOISE_HALF_SPREAD = 0.2

export function initialEconomy(rng: Rng, ageYears: number): EconomyState {
  const age = Math.max(0, ageYears)
  const meanWealthCents = BASE_WEALTH_CENTS + age * WEALTH_PER_AGE_YEAR_CENTS
  const noise = 1 - WEALTH_NOISE_HALF_SPREAD + rng.next() * 2 * WEALTH_NOISE_HALF_SPREAD
  return {
    employerId: null,
    monthlyIncomeCents: 0,
    wealthCents: cents(Math.max(0, Math.round(meanWealthCents * noise))),
    lastMonthConsumptionCents: 0
  }
}
