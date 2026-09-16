import { SimContext } from './context'
import { Person } from './types'

/**
 * Birth-cohort analytics (Roadmap A4, century-run observability): alive
 * residents grouped by birth DECADE (floor(birthTick / 10 years); founders
 * carry negative decades — they were born before the simulation starts).
 * Per cohort: alive count, mean wealth, employment share. Gauges are
 * re-stamped every monthly demographics fire; cohorts that died out are
 * zeroed (not frozen) so century charts never show stale tails.
 *
 * Called at the END of the demographics monthly pass. O(N) per month.
 * Digest note: adds `cohort.*` gauges to the metrics snapshot — run digests
 * re-base with this change (same-code replay determinism unaffected).
 */

const COHORT_SEEN_KEY = 'cohort.seenDecades'
const DECADE_TICKS = 86_400 // 10 years in ticks (TICKS_PER_YEAR = 8,640 × 10)

interface CohortAccumulator {
  alive: number
  wealthCents: number
  employed: number
}

export function recordCohortMetrics(ctx: SimContext): void {
  const cohorts = new Map<number, CohortAccumulator>()
  for (const person of ctx.world.persons) {
    if (!person.alive) continue
    const decade = Math.floor(person.birthTick / DECADE_TICKS)
    let acc = cohorts.get(decade)
    if (acc === undefined) {
      acc = { alive: 0, wealthCents: 0, employed: 0 }
      cohorts.set(decade, acc)
    }
    acc.alive++
    acc.wealthCents += person.economy.wealthCents
    if (person.economy.employerId !== null) acc.employed++
  }

  for (const [decade, acc] of [...cohorts.entries()].sort((x, y) => x[0] - y[0])) {
    const prefix = `cohort.d${decade}.`
    ctx.metrics.gauge(`${prefix}alive`, acc.alive)
    ctx.metrics.gauge(`${prefix}mean_wealth_cents`, acc.wealthCents / acc.alive)
    ctx.metrics.gauge(`${prefix}employment_rate`, acc.employed / acc.alive)
  }
  ctx.metrics.gauge('cohort.tracked', cohorts.size)

  // zero out cohorts that existed last month but have no living members now
  const seen = ctx.extensions.get(COHORT_SEEN_KEY) as Set<string> | undefined
  if (seen !== undefined) {
    for (const prefix of seen) {
      if (cohorts.has(decadeOfPrefix(prefix))) continue
      ctx.metrics.gauge(`${prefix}alive`, 0)
      ctx.metrics.gauge(`${prefix}mean_wealth_cents`, 0)
      ctx.metrics.gauge(`${prefix}employment_rate`, 0)
    }
  }
  const next = new Set<string>()
  for (const decade of cohorts.keys()) next.add(`cohort.d${decade}.`)
  ctx.extensions.set(COHORT_SEEN_KEY, next)
}

function decadeOfPrefix(prefix: string): number {
  return Number(prefix.slice('cohort.d'.length, -1))
}

/** Cohort decade for a birth tick — exported for tests/analytics consumers. */
export function cohortDecadeOf(person: Pick<Person, 'birthTick'>): number {
  return Math.floor(person.birthTick / DECADE_TICKS)
}
