import { TICKS_PER_MONTH, TICKS_PER_YEAR, ageYears } from '@genesis/core'
import { addMoney, cents, scaleMoney, subMoney } from '@genesis/shared'
import { SimContext } from '@genesis/simulation'
import type { EconomyDeps } from './deps'

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
 *
 * Cross-domain coupling is injectable only (EconomyDeps, e.g. the education
 * skill → wage multiplier); with deps omitted behavior is byte-identical to
 * the pre-HT-12 flows (multiplier 1.0).
 */

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

// ---------------------------------------------------------------------------
// Unemployment duration tracking (GEN-151b rehire friction)
// ---------------------------------------------------------------------------

const UNEMPLOYED_SINCE = 'economy.unemployedSince'

/** Side-table: personId -> tick at which the current unemployment spell began
 * (GEN-151b). Residents absent from the map are considered long-unemployed or
 * never employed (search-eligible once the cooldown passes from tick 0). */
function unemployedSinceMap(ctx: SimContext): Map<string, number> {
  const existing = ctx.extensions.get(UNEMPLOYED_SINCE)
  if (existing instanceof Map) return existing as Map<string, number>
  const created = new Map<string, number>()
  ctx.extensions.set(UNEMPLOYED_SINCE, created)
  return created
}

function markUnemployed(ctx: SimContext, personId: string, tick: number): void {
  const map = unemployedSinceMap(ctx)
  if (!map.has(personId)) map.set(personId, tick)
}

function markEmployed(ctx: SimContext, personId: string): void {
  unemployedSinceMap(ctx).delete(personId)
}

/** Search eligibility under rehire friction: the unemployment spell must be
 * at least rehireCooldownMonths old (or the person absent from the map). */
function searchEligible(ctx: SimContext, personId: string, tick: number): boolean {
  const since = unemployedSinceMap(ctx).get(personId)
  if (since === undefined) return true
  return tick - since >= ctx.config.rehireCooldownMonths * TICKS_PER_MONTH
}

// ---------------------------------------------------------------------------
// Pensions (economic depth): retirement accrues a pension from the final
// income; the pension is paid monthly from the taxation pool first
// (intergenerational transfer), shortfall deficit-created and audited.
// ---------------------------------------------------------------------------

const PENSIONS_KEY = 'economy.pensions'

function pensionsMap(ctx: SimContext): Map<string, number> {
  const existing = ctx.extensions.get(PENSIONS_KEY)
  if (existing instanceof Map) return existing as Map<string, number>
  const created = new Map<string, number>()
  ctx.extensions.set(PENSIONS_KEY, created)
  return created
}

export function pensionOf(ctx: SimContext, personId: string): number {
  return pensionsMap(ctx).get(personId) ?? 0
}

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

/** Defensive bounds for the injected skill wage multiplier (GEN-151b/HT-12):
 * the documented callback contract is already [0.5, 2]; the economy side
 * clamps anyway so a misbehaving injection can never break wage sanity. */
const WAGE_SKILL_MULTIPLIER_MIN = 0.5
const WAGE_SKILL_MULTIPLIER_MAX = 2

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
    if (!person.alive) {
      // red team RT1-10: dead residents' accumulator entries are garbage —
      // collected here (same pattern as the unemployedSince side-table)
      accumulators.delete(person.id)
      continue
    }
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
 * Mid-run economic shock (guide EXP-001): fires ONCE at the first month
 * boundary of simulated year `atYear`, laying off floor(layoffShare ×
 * employed) residents via a deterministic stride sweep over array order.
 * One-shot guard lives in ctx.extensions (no module-global state).
 */
export function applyEconomicShockIfNeeded(ctx: SimContext): void {
  const shock = ctx.config.economicShock
  if (shock === undefined) return
  const tick = ctx.tick()
  if (tick < (shock.atYear - 1) * TICKS_PER_YEAR) return
  const guardKey = 'economy.economic_shock_applied'
  if (ctx.extensions.get(guardKey) === true) return
  ctx.extensions.set(guardKey, true)

  const employed = ctx.world.persons.filter((p) => p.alive && p.economy.employerId !== null)
  const layoffCount = Math.floor(employed.length * shock.layoffShare)
  // deterministic victim selection: stride sweep over array order
  const stride = layoffCount > 0 ? employed.length / layoffCount : Infinity
  for (let i = 0; i < layoffCount; i++) {
    const person = employed[Math.floor(i * stride)] as NonNullable<(typeof employed)[number]>
    const employer = ctx.world.employers.find((e) => e.id === person.economy.employerId)
    if (employer !== undefined) employer.filledSlots = Math.max(0, employer.filledSlots - 1)
    person.economy.employerId = null
    person.economy.monthlyIncomeCents = 0
    markUnemployed(ctx, person.id, tick)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'job.ended',
      tick,
      actorIds: [person.id],
      payload: { reason: 'economic_shock' }
    })
  }
  ctx.metrics.increment('economy.shock_layoffs', layoffCount)
}

/**
 * Monthly labor-market round:
 * (0) economic shock — a single mid-run layoff wave if configured (EXP-001);
 * (a) retirement — employed persons at/over age 65 quit with p = 0.5/month
 *     (slot released, income zeroed, 'job.ended' reason 'retirement');
 * (b) job search — unemployed persons aged 18..64 search with p = 0.3/month
 *     and take the FIRST employer (array order) with a free slot
 *     ('job.started', wage = employer's monthly wage, income = wage priced
 *     through the injected skill multiplier at hire time, default 1.0).
 * Ages are derived from birthTick via ageYears (no stored age).
 */
// ---------------------------------------------------------------------------
// Taxation pool (EXP-030 funded variant / HT-12 taxation abstraction)
// ---------------------------------------------------------------------------

const TAX_POOL_KEY = 'economy.taxPool'

function getTaxPool(ctx: SimContext): number {
  const v = ctx.extensions.get(TAX_POOL_KEY)
  return typeof v === 'number' ? v : 0
}

function setTaxPool(ctx: SimContext, value: number): void {
  ctx.extensions.set(TAX_POOL_KEY, value)
}

/**
 * Monthly income taxation (EXP-030 funded variant / HT-12 taxation): employed
 * residents pay floor(rate × income) cents into the welfare pool. Money MOVES
 * wealth → pool (conserved, no creation). Deterministic: array-order sweep.
 */
export function monthlyTaxation(ctx: SimContext): void {
  const rate = ctx.config.incomeTaxRate ?? 0
  if (rate <= 0) return
  const tick = ctx.tick()
  let collected = 0
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    if (person.economy.employerId === null) continue
    const tax = scaleMoney(person.economy.monthlyIncomeCents, rate, 'floor')
    if (tax <= 0) continue
    person.economy.wealthCents = subMoney(person.economy.wealthCents, tax)
    collected = addMoney(collected, tax)
  }
  setTaxPool(ctx, getTaxPool(ctx) + collected)
  ctx.metrics.increment('economy.tax_collected_cents', collected)
}

/**
 * Welfare transfer (guide EXP-030 policy abstraction): unemployed working-age
 * residents receive `config.welfareTransferCents` per month. Money is CREATED
 * (government deficit abstraction — the one deliberate exception to closed
 * private-economy conservation) and audited via the
 * 'economy.welfare_paid_cents' counter. Income lands in
 * monthlyIncomeCents (total-monthly-income semantics) and is overwritten when
 * employment resumes. Deterministic: no randomness.
 */
export function monthlyWelfare(ctx: SimContext): void {
  const transfer = ctx.config.welfareTransferCents ?? 0
  if (transfer <= 0) return
  const tick = ctx.tick()
  const paidAtStart = ctx.metrics.counterValue('economy.welfare_paid_cents')
  const poolAtStart = getTaxPool(ctx)
  let deficit = 0
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    if (person.economy.employerId !== null) continue
    const age = ageYears(person.birthTick, tick)
    // red team RT4-08: a recipient who aged out of the window keeps the stale
    // transfer income forever unless it is explicitly cleared
    if ((age < WORKING_AGE_MIN || age >= RETIREMENT_AGE) && person.economy.monthlyIncomeCents === transfer) {
      person.economy.monthlyIncomeCents = 0
      continue
    }
    if (age < WORKING_AGE_MIN || age >= RETIREMENT_AGE) continue
    if (person.economy.monthlyIncomeCents === transfer) continue // already receiving
    // REAL transfer (red team RT4-03): the money actually lands in wealth,
    // funded from the taxation pool first; only the shortfall is deficit.
    person.economy.monthlyIncomeCents = transfer
    person.economy.wealthCents += transfer
    deficit += transfer
    ctx.metrics.increment('economy.welfare_paid_cents', transfer)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'welfare.paid',
      tick,
      actorIds: [person.id],
      payload: { amountCents: transfer }
    })
  }
  // deficit accounting: paid total vs what the taxation pool actually funded
  // (red team RT4-03 resolution) — transparent rather than hidden creation
  const paidThisRun = ctx.metrics.counterValue('economy.welfare_paid_cents') - paidAtStart
  if (deficit > 0) {
    const name = 'economy.welfare_deficit_cents'
    ctx.metrics.gauge(name, ctx.metrics.gaugeValue(name) + deficit)
  }
  void paidThisRun
  const recipients = ctx.world.persons.filter(
    (p) => p.alive && p.economy.employerId === null && p.economy.monthlyIncomeCents === transfer &&
      ageYears(p.birthTick, tick) >= WORKING_AGE_MIN && ageYears(p.birthTick, tick) < RETIREMENT_AGE
  ).length
  ctx.metrics.gauge('economy.welfare_recipients', recipients)
}

/**
 * Monthly pension payout (economic depth): retirees (65+, no employer, with a
 * pension record) receive their pension monthly, paid from the taxation pool
 * first; the shortfall is deficit-created and audited. The pension lands in
 * monthlyIncomeCents (income semantics — feeds runway/strain). Deterministic.
 */
export function monthlyPension(ctx: SimContext): void {
  const tick = ctx.tick()
  const pensions = pensionsMap(ctx)
  const poolAtStart = getTaxPool(ctx)
  const personsById = new Map(ctx.world.persons.map((p) => [p.id, p]))
  let pensionTotal = 0
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    if (ageYears(person.birthTick, tick) < RETIREMENT_AGE) continue
    if (person.economy.employerId !== null) continue
    const pension = pensions.get(person.id) ?? 0
    if (pension <= 0) continue
    person.economy.monthlyIncomeCents = pension
    person.economy.wealthCents += pension
    pensionTotal += pension
    ctx.metrics.increment('economy.pension_paid_cents', pension)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'pension.paid',
      tick,
      actorIds: [person.id],
      payload: { amountCents: pension }
    })
  }
  // pool funding: pension total is transferred from the taxation pool; the
  // shortfall beyond the pool is deficit-created (audited gauge)
  const funded = Math.min(poolAtStart, pensionTotal)
  setTaxPool(ctx, poolAtStart - funded)
  const deficitCreated = pensionTotal - funded
  if (deficitCreated > 0) {
    const name = 'economy.pension_deficit_cents'
    ctx.metrics.gauge(name, ctx.metrics.gaugeValue(name) + deficitCreated)
  }
}

export function monthlyJobMarket(ctx: SimContext, deps?: EconomyDeps): void {
  const tick = ctx.tick()
  const rng = ctx.rng.fork(`economy.jobmarket:${tick}`)

  // (-2) taxation (EXP-030 funded variant) — collects BEFORE welfare pays
  monthlyTaxation(ctx)

  // (-1) welfare transfer (EXP-030) — before hire pricing so the cooldown
  // exit cohort carries the transfer income into their strain calculation
  monthlyWelfare(ctx)
  monthlyPension(ctx)

  // (0) economic shock (EXP-001)
  applyEconomicShockIfNeeded(ctx)

  // (a) retirement
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    if (person.economy.employerId === null) continue
    if (ageYears(person.birthTick, tick) < RETIREMENT_AGE) continue
    if (!rng.bool(RETIREMENT_PROBABILITY_PER_MONTH)) continue
    // pension accrual (economic depth): the pension is a share of the final
    // income, recorded in the side-table for the monthly pension payout
    pensionsMap(ctx).set(
      person.id,
      scaleMoney(person.economy.monthlyIncomeCents, ctx.config.pensionReplacementRate ?? 0.6, 'floor')
    )
    const employer = ctx.world.employers.find((e) => e.id === person.economy.employerId)
    if (employer !== undefined) employer.filledSlots = Math.max(0, employer.filledSlots - 1)
    person.economy.employerId = null
    person.economy.monthlyIncomeCents = 0
    markUnemployed(ctx, person.id, tick)
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'job.ended',
      tick,
      actorIds: [person.id],
      payload: { reason: 'retirement' }
    })
  }

  // (b) job search — gated by rehire friction (GEN-151b): an unemployment
  // spell younger than rehireCooldownMonths cannot search yet
  const unemployedMap = unemployedSinceMap(ctx)
  for (const person of ctx.world.persons) {
    if (!person.alive) {
      // red team RT3-06: dead residents' side-table entries are garbage
      unemployedMap.delete(person.id)
      continue
    }
    if (person.economy.employerId !== null) continue
    const age = ageYears(person.birthTick, tick)
    if (age < WORKING_AGE_MIN || age >= RETIREMENT_AGE) continue
    if (!searchEligible(ctx, person.id, tick)) continue
    if (!rng.bool(JOB_SEARCH_PROBABILITY_PER_MONTH)) continue
    const employer = ctx.world.employers.find((e) => e.filledSlots < e.jobSlots)
    if (employer === undefined) continue
    person.economy.employerId = employer.id
    // GEN-151b follow-up (HT-12): skill is priced ONCE, at the moment of hire,
    // and is NOT re-evaluated when the person's skill changes afterwards —
    // recorded v1 simplification (no mid-employment wage repricing).
    const multiplier = clamp(
      deps?.wageSkillMultiplier?.(ctx, person.id) ?? 1,
      WAGE_SKILL_MULTIPLIER_MIN,
      WAGE_SKILL_MULTIPLIER_MAX
    )
    const incomeCents = cents(Math.round(employer.monthlyWageCents * multiplier))
    person.economy.monthlyIncomeCents = incomeCents
    markEmployed(ctx, person.id)
    employer.filledSlots++
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'job.started',
      tick,
      actorIds: [person.id, employer.id],
      // wageCents = employer's standard wage; incomeCents = actually priced pay
      payload: { wageCents: employer.monthlyWageCents, incomeCents }
    })
  }
}
