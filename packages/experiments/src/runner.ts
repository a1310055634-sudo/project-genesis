import { GenesisSystem, populationStats, Simulation } from '@genesis/simulation'
import { ExperimentConfig } from './config'
import { ci95HalfWidth, mean, stdDev } from './stats'

/**
 * Experiment runner (Wave 5, guide §23). Executes every arm × seed cell of an
 * ExperimentConfig on a freshly constructed full system stack (injected by the
 * caller — this package is engine-level and never imports a composition root),
 * then harvests the full metrics snapshot plus population counters.
 *
 * Determinism contract:
 * - All simulation randomness flows from the engine's seeded RNG; this module
 *   draws no randomness of its own.
 * - Same config + same seed set ⇒ identical outcomes modulo runtimeMs.
 * - runtimeMs uses ONLY an injected clock (`opts.now`); without one it is
 *   recorded as 0 so exports stay byte-reproducible. No Date.now() here.
 */
export interface RunOutcome {
  arm: string
  seed: number | string
  /** Alive persons at end of run. */
  alive: number
  /** Total persons ever registered (incl. dead) at end of run. */
  population: number
  /** Engine replay digest of the final world (GEN-011). */
  digest: string
  /** Wall-clock cost of the run; 0 unless the caller injects `opts.now`. */
  runtimeMs: number
  /** Full metrics snapshot + population.* counters merged in. */
  metrics: Record<string, number>
}

export interface ExperimentResult {
  config: ExperimentConfig
  /** One outcome per arm × seed, in config declaration order. */
  outcomes: RunOutcome[]
}

export interface RunExperimentOptions {
  /** Run the engine's monthly invariant checks (default true). */
  invariantChecks?: boolean
  /**
   * Injected monotonic clock in ms (observability layer concern). When
   * omitted, runtimeMs is recorded as 0 to keep every derived export
   * byte-reproducible.
   */
  now?: () => number
}

/** Metric keys merged into every outcome alongside the engine snapshot. */
const POP_ALIVE = 'population.alive'
const POP_PERSONS = 'population.persons'
const POP_CHILDREN = 'population.children'
const POP_CHILDREN_SHARE = 'population.childrenShare'

export function runExperiment(
  config: ExperimentConfig,
  systemsFactory: () => GenesisSystem[],
  opts?: RunExperimentOptions
): ExperimentResult {
  // The ≥2-arms / baseline-first design rule is enforced where experiments are
  // defined (config validation); the runner executes any well-formed grid so
  // single cells can be re-run in isolation.
  if (config.arms.length < 1) {
    throw new Error(`experiment ${config.id}: needs at least 1 arm, got ${config.arms.length}`)
  }
  if (config.seeds.length === 0) throw new Error(`experiment ${config.id}: seeds must not be empty`)

  const invariantChecks = opts?.invariantChecks !== false
  const now = opts?.now
  const outcomes: RunOutcome[] = []

  for (const arm of config.arms) {
    for (const seed of config.seeds) {
      const startedAt = now === undefined ? 0 : now()
      const sim = Simulation.create(
        { seed, populationTarget: config.population, years: config.years, ...arm.overrides },
        { systems: systemsFactory(), checkInvariants: invariantChecks }
      )
      sim.run()
      const runtimeMs = now === undefined ? 0 : now() - startedAt

      const stats = populationStats(sim.ctx)
      const metrics: Record<string, number> = { ...sim.ctx.metrics.snapshot() }
      // Engine snapshots only carry registered gauges/counters; the population
      // counters (and the child share derived from them) are merged here so
      // every experiment can aggregate them like any other metric.
      metrics[POP_ALIVE] = stats.alive
      metrics[POP_PERSONS] = stats.persons
      metrics[POP_CHILDREN] = stats.children
      metrics[POP_CHILDREN_SHARE] = stats.alive === 0 ? 0 : stats.children / stats.alive

      outcomes.push({
        arm: arm.name,
        seed,
        alive: stats.alive,
        population: stats.persons,
        digest: sim.digest(),
        runtimeMs,
        metrics
      })
    }
  }

  return { config, outcomes }
}

/** Aggregated view of one metric for one arm. */
export interface MetricSummary {
  arm: string
  n: number
  mean: number
  stdDev: number
  ci95: number
}

/**
 * Aggregate an outcome metric per arm (config arm order).
 * Throws naming the arm when any of its outcomes lacks the metric.
 */
export function summarize(result: ExperimentResult, metric: string): MetricSummary[] {
  const summaries: MetricSummary[] = []
  for (const arm of result.config.arms) {
    const values: number[] = []
    for (const outcome of result.outcomes) {
      if (outcome.arm !== arm.name) continue
      const v = outcome.metrics[metric]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(
          `summarize: metric "${metric}" is missing or non-finite for arm "${arm.name}" (experiment ${result.config.id})`
        )
      }
      values.push(v)
    }
    summaries.push({
      arm: arm.name,
      n: values.length,
      mean: mean(values),
      stdDev: stdDev(values),
      ci95: ci95HalfWidth(values)
    })
  }
  return summaries
}
