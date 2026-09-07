import { TICKS_PER_MONTH, ageYears } from '@genesis/core'
import { addMoney, scaleMoney, subMoney } from '@genesis/shared'
import { SimContext } from '@genesis/simulation'

/**
 * Economy flows (GEN-026): payroll, consumption and the job market.
 *
 * Hard invariants (guide §4.5):
 * - Money is always integer cents, manipulated via @genesis/shared helpers.
 * - No money is created or destroyed: payroll adds exactly the income sum,
 *   consumption only subtracts and never lets wealth go negative (v1 has no
 *   debt — spending is capped at current wealth).
 * - All randomness comes from the ctx RNG forked per (system, tick); iteration
 *   is in world.persons / world.employers array (creation) order.
 */

// ---------------------------------------------------------------------------
// Tunables (named constants with rationale; v1 values are illustrative, not
// calibrated against real data — recorded simplification).
// ---------------------------------------------------------------------------

/** Baseline cost of living, cents/day (~$15) regardless of income. */
const DAILY_BASE_CONSUMPTION_CENTS = 1_500
/**
 * Daily spending as a share of MONTHLY income. 0.02/day ≈ 60% of a month's
 * income consumed over a 30-day month (implied ~40% savings rate).
 */
const CONSUMPTION_INCOME_DAILY_SHARE = 0.02
/** Uniform daily spending noise in [0, 500) cents (~$5) — idiosyncratic jitter. */
const DAILY_CONSUMPTION_NOISE_MAX_CENTS = 500

/** Monthly retirement hazard once at/over retirement age. */
const RETIREMENT_PROBABILITY_PER_MONTH = 0.5
/** Monthly job-search probability for unemployed working-age adults. */
const JOB_SEARCH_PROBABILITY_PER_MONTH = 0.3
/** Working-age bounds (inclusive min, exclusive max), matching lifeStageFor. */
const WORKING_AGE_MIN = 18
const RETIREMENT_AGE = 65

// ---------------------------------------------------------------------------
// Payroll (monthly)
// ---------------------------------------------------------------------------

/**
 * Pay everyone with an employer their monthly income (array order). Adds
 * exactly sum(monthlyIncomeCents) to total wealth — no leakage.
 */
export function monthlyPayroll(ctx: SimContext): void {
  const tick = ctx.tick()
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const employerId = person.economy.employerId
    if (employerId === null) continue
    const amount = person.economy.monthlyIncomeCents
    person.economy.wealthCents = addMoney(person.economy.wealthCents, amount)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'income.received',
      tick,
      actorIds: [person.id, employerId],
      payload: { amountCents: amount, employerId }
    })
  }
}

// ---------------------------------------------------------------------------
// Consumption (daily)
// ---------------------------------------------------------------------------

/**
 * Per-person monthly consumption accumulator, keyed by person id and stored in
 * the context extension slots (no hidden module state). Used to maintain
 * EconomyState.lastMonthConsumptionCents without an extra monthly scan.
 */
interface ConsumptionAccumulator {
  monthIndex: number
  sumCents: number
}
const CONSUMPTION_ACCUMULATOR_KEY = 'economy.consumptionAccumulator'

function consumptionAccumulator(ctx: SimContext): Map<string, ConsumptionAccumulator> {
  let map = ctx.extensions.get(CONSUMPTION_ACCUMULATOR_KEY) as Map<string, ConsumptionAccumulator> | undefined
  if (map === undefined) {
    map = new Map<string, ConsumptionAccumulator>()
    ctx.extensions.set(CONSUMPTION_ACCUMULATOR_KEY, map)
  }
  return map
}

/**
 * Daily consumption: spend = clamp(base + incomeShare + noise, 0, wealth).
 * The upper clamp enforces the v1 no-debt rule (spending is limited to the
 * wealth a person actually holds). `lastMonthConsumptionCents` is flushed
 * lazily on the first day of each new month. Zero-spend days emit no event
 * (keeps the append-only log meaningful; accounting is unaffected since the
 * amount would be 0).
 */
export function dailyConsumption(ctx: SimContext): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`economy.consumption:${tick}`)
  const monthIndex = Math.floor(tick / TICKS_PER_MONTH)
  const accumulators = consumptionAccumulator(ctx)

  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const economy = person.economy

    const incomeShare = scaleMoney(economy.monthlyIncomeCents, CONSUMPTION_INCOME_DAILY_SHARE, 'floor')
    const desired =
      DAILY_BASE_CONSUMPTION_CENTS +
      incomeShare +
      rng.int(0, DAILY_CONSUMPTION_NOISE_MAX_CENTS - 1)
    const spend = Math.min(desired, economy.wealthCents) // never below 0: both terms are >= 0
    if (spend > 0) {
      economy.wealthCents = subMoney(economy.wealthCents, spend)
      ctx.events.emit({
        id: ctx.ids.next('event'),
        type: 'consumption.paid',
        tick,
        actorIds: [person.id],
        payload: { amountCents: spend }
      })
    }

    // Lazy month rollover: flush what the person consumed last month.
    const acc = accumulators.get(person.id)
    if (acc === undefined) {
      accumulators.set(person.id, { monthIndex, sumCents: spend })
    } else if (acc.monthIndex !== monthIndex) {
      economy.lastMonthConsumptionCents = acc.sumCents
      acc.monthIndex = monthIndex
      acc.sumCents = spend
    } else {
      acc.sumCents += spend
    }
  }
}

// ---------------------------------------------------------------------------
// Job market (monthly)
// ---------------------------------------------------------------------------

/**
 * Monthly labor-market round:
 * (a) retirement — employed persons at/over age 65 quit with p = 0.5/month
 *     (slot released, income zeroed, 'job.ended' reason 'retirement');
 * (b) job search — unemployed persons aged 18..64 search with p = 0.3/month
 *     and take the FIRST employer (array order) with a free slot
 *     ('job.started', wage = employer's monthly wage).
 * Ages are derived from birthTick via ageYears (no stored age).
 */
export function monthlyJobMarket(ctx: SimContext): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`economy.jobmarket:${tick}`)

  // (a) retirement
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    if (person.economy.employerId === null) continue
    if (ageYears(person.birthTick, tick) < RETIREMENT_AGE) continue
    if (!rng.bool(RETIREMENT_PROBABILITY_PER_MONTH)) continue
    const employer = ctx.world.employers.find((e) => e.id === person.economy.employerId)
    if (employer !== undefined) employer.filledSlots = Math.max(0, employer.filledSlots - 1)
    person.economy.employerId = null
    person.economy.monthlyIncomeCents = 0
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'job.ended',
      tick,
      actorIds: [person.id],
      payload: { reason: 'retirement' }
    })
  }

  // (b) job search
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    if (person.economy.employerId !== null) continue
    const age = ageYears(person.birthTick, tick)
    if (age < WORKING_AGE_MIN || age >= RETIREMENT_AGE) continue
    if (!rng.bool(JOB_SEARCH_PROBABILITY_PER_MONTH)) continue
    const employer = ctx.world.employers.find((e) => e.filledSlots < e.jobSlots)
    if (employer === undefined) continue
    person.economy.employerId = employer.id
    person.economy.monthlyIncomeCents = employer.monthlyWageCents
    employer.filledSlots++
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'job.started',
      tick,
      actorIds: [person.id, employer.id],
      payload: { wageCents: employer.monthlyWageCents }
    })
  }
}
