import { SimulationConfig } from '@genesis/simulation'

/**
 * Experiment definitions (Wave 5, guide §23 / HT-16 catalog subset).
 *
 * An experiment contrasts one or more treatment arms against a baseline
 * control arm (arms[0]) over a shared seed set. Everything is model-internal:
 * the questions verify wiring and behavior of the Genesis internal models
 * (economy → psychology pathways, demography parameters), never real-world
 * causal claims.
 */
export interface ExperimentArm {
  /** Unique within the experiment; arms[0] is the baseline control. */
  name: string
  /** Config overrides applied on top of the experiment-level base config. */
  overrides: Partial<SimulationConfig>
}

export interface ExperimentConfig {
  /** Catalog id, e.g. 'EXP-002'. */
  id: string
  /** Research question phrased as a model-internal mechanism check. */
  question: string
  /** Seed set shared by all arms (replay key, guide §2.1). */
  seeds: number[]
  /** populationTarget generated at tick 0 for every arm. */
  population: number
  /** Simulated years for every arm. */
  years: number
  /** At least 2; the first arm is the baseline control. */
  arms: ExperimentArm[]
}

function validate(config: ExperimentConfig): ExperimentConfig {
  if (config.arms.length < 2) {
    throw new Error(`experiment ${config.id}: needs at least 2 arms (baseline control + treatment), got ${config.arms.length}`)
  }
  // red team RT2-03: seed/years are experiment-level contracts — an arm
  // silently overriding them would poison cross-arm comparisons
  for (const arm of config.arms) {
    for (const reserved of ['seed', 'years'] as const) {
      if (reserved in arm.overrides) {
        throw new Error(`experiment ${config.id}: arm "${arm.name}" overrides reserved key "${reserved}"`)
      }
    }
  }
  const names = new Set<string>()
  for (const arm of config.arms) {
    if (names.has(arm.name)) throw new Error(`experiment ${config.id}: duplicate arm name "${arm.name}"`)
    names.add(arm.name)
  }
  if (config.seeds.length === 0) throw new Error(`experiment ${config.id}: seeds must not be empty`)
  if (!Number.isInteger(config.population) || config.population <= 0) {
    throw new Error(`experiment ${config.id}: population must be a positive integer, got ${config.population}`)
  }
  if (!(config.years > 0)) throw new Error(`experiment ${config.id}: years must be > 0, got ${config.years}`)
  return config
}

/**
 * Preset experiments. Every question is a MODEL-INTERNAL mechanism check:
 * it verifies that the simulator's wired-in model relationships behave as the
 * model intends (e.g. the financial-strain → stress pathway), not that any
 * real-world causality holds.
 */
export const EXPERIMENTS: Record<string, ExperimentConfig> = {
  /**
   * EXP-001: economic shock → aggregate stress (guide §23 Wave 5).
   * Mechanism under test: a mid-run layoff wave (economicShock at year 1,
   * 40% of employed) spikes financialStrain via the runway formula, which the
   * composition bridge feeds into the stress update.
   *
   * STATUS 2026-09-08 (final, after GEN-151b): direction REPRODUCED with the
   * 2-month rehire cooldown on both arms and post-shock window sampling.
   * Minimal-stack window (months 2-6): shock > control with disjoint CI95.
   * Full-stack early window: 0.493 vs 0.482 (direction positive, modest).
   * History: endpoint means were flat (0.460 vs 0.467) until rehire friction
   * + intra-run sampling landed — recorded as the framework's second full
   * experiment→diagnosis→fix→confirm round trip.
   */
  'EXP-001': validate({
    id: 'EXP-001',
    question:
      'Model-internal mechanism check: does a mid-run layoff shock (40% of employed at the ' +
      'start of year 1) produce higher mean stress than an economy that keeps full ' +
      'employment, measured after 2 simulated years? Verifies the shock→strain→stress ' +
      'pathway inside the simulator; no real-world causal claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      // both arms carry a 2-month rehire cooldown (GEN-151b): without it the
      // shock's unemployment spell lasts ~1 month and the stress signal
      // dilutes to nothing in any aggregate
      { name: 'control', overrides: { rehireCooldownMonths: 2 } },
      { name: 'shock', overrides: { rehireCooldownMonths: 2, economicShock: { atYear: 1, layoffShare: 0.4 } } }
    ]
  }),

  /**
   * EXP-002: unemployment → aggregate stress.
   * Mechanism under test: the composition-bridged pathway
   * employmentRate → financialStrainOf (@genesis/economy, unemployed = 0.85)
   * → stress update (@genesis/psychology). Expected direction inside the
   * model: treatment (employmentRate 0.05) stress.mean > control (0.62).
   */
  'EXP-002': validate({
    id: 'EXP-002',
    question:
      'Model-internal mechanism check: with the economy→psychology bridge active ' +
      '(financialStrainOf: unemployed=0.85 vs employed runway-scaled), does a population ' +
      'generated at employmentRate 0.05 accumulate higher mean stress than one at 0.62? ' +
      'Verifies the wired stress pathway inside the simulator; no real-world causal claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      { name: 'control', overrides: { employmentRate: 0.62 } },
      { name: 'treatment', overrides: { employmentRate: 0.05 } }
    ]
  }),

  /**
   * EXP-027: fertility parameter sweep (guide HT-16).
   * Mechanism under test: birthProbabilityPerMonth drives the demography
   * system's monthly birth draw for eligible married households. Expected
   * direction inside the model: population.persons and childrenShare rise
   * monotonically with the parameter.
   */
  'EXP-027': validate({
    id: 'EXP-027',
    question:
      'Model-internal parameter sweep: does the demography system\'s birth probability ' +
      '(monthly, per eligible married household) order final population size and child share ' +
      'as 0.002 < 0.008 < 0.03 over a 3-year horizon? Verifies the fertility knob of the ' +
      'internal population model; no real-world demographic claim.',
    seeds: [42, 43],
    population: 120,
    years: 3,
    arms: [
      { name: 'birth-0.002', overrides: { birthProbabilityPerMonth: 0.002 } },
      { name: 'birth-0.008', overrides: { birthProbabilityPerMonth: 0.008 } },
      { name: 'birth-0.03', overrides: { birthProbabilityPerMonth: 0.03 } }
    ]
  }),

  /**
   * EXP-006: extraversion → network growth (guide §23 Wave 5 / HT-16).
   * Mechanism under test: the population-level extraversionBias shifts every
   * resident's trait at generation; interaction and friendship dynamics in
   * @genesis/social respond to personality.
   *
   * STATUS 2026-09-08 (updated after GEN-053b): direction REPRODUCED. The
   * interaction-frequency pathway (p_attempt = 0.6 + 0.8*(extraversion-0.5))
   * flipped the result: extraverted arm ~1391 edges vs control ~1072 (+30%,
   * all 3 seeds consistent, CI95 disjoint). First full round trip:
   * experiment -> negative result -> model gap -> fix -> direction confirmed.
   */
  'EXP-006': validate({
    id: 'EXP-006',
    question:
      'Model-internal mechanism check: does shifting the whole population\'s extraversion ' +
      'upward (+0.4 bias) produce a denser social network (more edges, higher mean degree) ' +
      'than an unbiased population over 2 years? Verifies the personality→network pathway ' +
      'inside the simulator; no real-world psychological claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      { name: 'control', overrides: { extraversionBias: 0 } },
      { name: 'extraverted', overrides: { extraversionBias: 0.4 } }
    ]
  }),

  /**
   * EXP-SANITY: scale sanity sweep.
   * Mechanism under test: core aggregates stay well-formed as the population
   * scale changes 60 → 200 (no NaN in metrics, shares within [0, 1], digests
   * well-defined). A smoke guard against scale-dependent numeric blowups.
   */
  'EXP-SANITY': validate({
    id: 'EXP-SANITY',
    question:
      'Model-internal scale sanity: at populationTarget 60 vs 200 (same seeds), do all ' +
      'collected metrics stay finite, do model-computed shares stay in [0,1], and do digests ' +
      'reproduce per seed? Guards against scale-dependent numeric degradation in the engine; ' +
      'no real-world claim.',
    seeds: [42, 43, 44],
    population: 60, // base config; the 'large' arm overrides populationTarget
    years: 2,
    arms: [
      { name: 'small', overrides: { populationTarget: 60 } },
      { name: 'large', overrides: { populationTarget: 200 } }
    ]
  })
}
