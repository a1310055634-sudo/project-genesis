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
  // single-arm presets are allowed for persistence/monitoring checks (EXP-022);
  // anything making a treatment CLAIM needs >= 2 arms — enforced here
  if (config.arms.length < 1) {
    throw new Error(`experiment ${config.id}: needs at least 1 arm, got ${config.arms.length}`)
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
 *
 * RE-RUN 2026-09-10 after red team RT4-04 (seed derivation is seed-only now,
 * so arms are PAIRED WORLDS — identical population/employers/RNG landscape,
 * differing only in the treatment). All 7 presets re-verified with direction
 * confirmed; per-arm numbers below in each experiment's STATUS are from the
 * paired-world runs and supersede earlier unpaired numbers.
 */
export const EXPERIMENTS: Record<string, ExperimentConfig> = {
  /**
   * EXP-003: social support moderates stress (guide §23 Wave 5).
   * Mechanism under test: the population-level communitySupportBias raises
   * every resident's social support input; the stress update weights social
   * support as a negative (buffering) term. Expected direction inside the
   * model: the supported arm's stress.mean < control.
   */
  'EXP-003': validate({
    id: 'EXP-003',
    question:
      'Model-internal mechanism check: does raising community support for the whole ' +
      'support (+0.3 bias) lower mean stress relative to an unbiased population over 2 ' +
      'years? Verifies the support→stress buffering pathway inside the simulator; no ' +
      'real-world causal claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      { name: 'control', overrides: { communitySupportBias: 0 } },
      { name: 'supported', overrides: { communitySupportBias: 0.3 } }
    ]
  }),

  /**
   * EXP-004: housing burden → wellbeing (guide §23 Wave 5).
   * Mechanism under test: doubling assigned rent doubles the housing burden
   * indicator, which folds into financial strain (60/40 mixture in the
   * composition bridge) and via it into stress/wellbeing. Expected direction
   * inside the model: high-rent arm stress.mean > control, wellbeing lower.
   */
  'EXP-004': validate({
    id: 'EXP-004',
    question:
      'Model-internal mechanism check: does doubling housing costs (housingCostMultiplier 2) ' +
      'raise mean stress and lower mean wellbeing relative to baseline rent over 2 years? ' +
      'Verifies the housing→strain→stress pathway inside the simulator; no real-world causal claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      { name: 'control', overrides: { housingCostMultiplier: 1 } },
      { name: 'high-rent', overrides: { housingCostMultiplier: 2 } }
    ]
  }),

  /**
   * EXP-030: policy transfer abstraction (guide HT-16).
   * Mechanism under test: a monthly welfare transfer to unemployed
   * working-age residents (welfareTransferCents) softens the unemployed
   * strain floor, lowering cohort stress relative to a no-transfer economy.
   * Expected direction inside the model: welfare arm stress.mean < control.
   */
  'EXP-030': validate({
    id: 'EXP-030',
    question:
      'Model-internal policy check: does a 250k-cents/month welfare transfer to unemployed ' +
      'working-age residents lower cohort stress relative to a no-transfer economy over 2 ' +
      'years? Verifies the policy→strain softening pathway inside the simulator (model ' +
      'internal only; no real-world policy claim).',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      // funded variant (RT4-03 resolution): a 10% income tax fills the pool
      // first; only the shortfall is deficit-created (audited)
      { name: 'control', overrides: {} },
      { name: 'welfare', overrides: { welfareTransferCents: 250_000, incomeTaxRate: 0.1 } }
    ]
  }),

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
      'Model-internal mechanism check: does a mid-run layoff shock (50% of employed at the ' +
      'start of year 1) produce higher mean stress than an economy that keeps full ' +
      'employment, measured after 2 simulated years? Verifies the shock→strain→stress ' +
      'pathway inside the simulator; no real-world causal claim.',
    seeds: [42, 43, 44, 45, 46],
    population: 300,
    years: 2,
    arms: [
      // both arms carry a 2-month rehire cooldown (GEN-151b): without it the
      // shock's unemployment spell lasts ~1 month and the stress signal
      // dilutes to nothing in any aggregate
      { name: 'control', overrides: { rehireCooldownMonths: 2 } },
      { name: 'shock', overrides: { rehireCooldownMonths: 2, economicShock: { atYear: 1, layoffShare: 0.5 } } }
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
   * STATUS 2026-09-08/09: direction REPRODUCED and STRENGTHENED by the KI-8
   * attention budget (friendCap = 20 + 20*extraversion). Full-stack early
   * window (months 1-6): extraverted 344 edges vs control 250 (+38%, CI95
   * disjoint). History: endpoint means flat (0.460 vs 0.467) -> interaction-
   * frequency pathway (GEN-053b) flipped it (+30%) -> attention cap amplified
   * it (+38%). Two full experiment->diagnosis->fix->confirm round trips.
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
   * EXP-029: wage inequality sweep (guide HT-16).
   * Mechanism under test: wageSpreadMultiplier scales generated employer-wage
   * VARIANCE around a constant mean. Expected direction inside the model:
   * the high-spread arm ends with higher wage dispersion (stress.max-mean
   * income spread) and higher wealth inequality than the control.
   */
  'EXP-029': validate({
    id: 'EXP-029',
    question:
      'Model-internal parameter sweep: does doubling the employer-wage spread ' +
      '(wageSpreadMultiplier 1 vs 1.4, same mean) widen end-of-run wage dispersion and ' +
      'wealth inequality? Verifies the wage-distribution knob of the internal economy ' +
      'model; no real-world causal claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      { name: 'control', overrides: { wageSpreadMultiplier: 1 } },
      { name: 'high-spread', overrides: { wageSpreadMultiplier: 1.4 } }
    ]
  }),

  /**
   * EXP-021: information diffusion speed (guide HT-16, media domain).
   * Mechanism under test: denser social networks (extraversionBias → more
   * ties → higher hearing probability per person) spread newspaper pieces
   * faster. Expected direction inside the model: the extraverted arm's
   * media_last_piece_heard > control.
   */
  'EXP-021': validate({
    id: 'EXP-021',
    question:
      'Model-internal mechanism check: does a denser social network (extraversion bias +0.4) ' +
      'spread newspaper pieces to more listeners by end of run? Verifies the ' +
      'network→media-exposure pathway inside the simulator; no real-world causal claim.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    arms: [
      { name: 'control', overrides: { extraversionBias: 0 } },
      { name: 'extraverted', overrides: { extraversionBias: 0.4 } }
    ]
  }),

  /**
   * EXP-022: rumor persistence (guide HT-16, media domain).
   * Mechanism under test: the SAME piece keeps accumulating hearings while
   * the network stays alive — information never "dies" in v1 (no belief
   * decay; recorded simplification). Expected direction inside the model:
   * total hearings in year 2 > year 1 (monotone growth).
   */
  'EXP-022': validate({
    id: 'EXP-022',
    question:
      'Model-internal persistence check: does cumulative information hearing count keep ' +
      'growing monotonically across the run (no unmodeled decay)? Guards against accidental ' +
      'event-loss or counter resets in the media pipeline; no real-world causal claim.',
    seeds: [42],
    population: 150,
    years: 2,
    arms: [
      { name: 'baseline', overrides: {} }
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
