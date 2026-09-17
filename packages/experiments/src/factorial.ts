import type { GenesisSystem, SimulationConfig } from '@genesis/simulation'
import { ExperimentArm, ExperimentConfig } from './config'
import { ExperimentResult, MetricSummary, runExperiment, summarize } from './runner'

/**
 * Factorial experiments (Roadmap C1): a factor GRID generates the arm matrix
 * (every level combination = one arm; each factor's FIRST level is the
 * baseline cell), and the readout reports per-factor MAIN EFFECTS (deviation
 * of a level mean from the grand mean) plus PAIRWISE INTERACTIONS for
 * 2-level factor pairs (difference-in-differences). Reuses runExperiment —
 * paired worlds (numericSeed derived from seed only) still hold across the
 * whole grid.
 */

export interface FactorialSpec {
  id: string
  question: string
  seeds: number[]
  population: number
  years: number
  /** Outcome metric read from the end-of-run metrics snapshot. */
  metric: string
  /** Factor name → ordered levels; FIRST level = baseline. */
  factors: Record<string, number[]>
}

export function generateArms(spec: FactorialSpec): {
  arms: ExperimentArm[]
  levelsByArm: Map<string, Record<string, number>>
} {
  const names = Object.keys(spec.factors)
  if (names.length === 0) throw new Error(`factorial ${spec.id}: needs at least one factor`)
  for (const name of names) {
    if (spec.factors[name].length === 0) {
      throw new Error(`factorial ${spec.id}: factor "${name}" needs at least one level`)
    }
    if (name === 'seed' || name === 'years') {
      throw new Error(`factorial ${spec.id}: "${name}" is a reserved factor name`)
    }
  }
  const arms: ExperimentArm[] = []
  const levelsByArm = new Map<string, Record<string, number>>()
  const recurse = (i: number, overrides: Partial<SimulationConfig>, levels: Record<string, number>): void => {
    if (i === names.length) {
      const name = names.map((n) => `${n}=${levels[n]}`).join('|')
      arms.push({ name, overrides: { ...overrides } })
      levelsByArm.set(name, { ...levels })
      return
    }
    const factor = names[i]
    for (const level of spec.factors[factor]) {
      recurse(i + 1, { ...overrides, [factor]: level }, { ...levels, [factor]: level })
    }
  }
  recurse(0, {}, {})
  return { arms, levelsByArm }
}

export interface FactorEffect {
  factor: string
  levels: Array<{ level: number; mean: number; effect: number }>
}

export interface Interaction {
  factorA: string
  factorB: string
  /** (A1B1 − A0B1) − (A1B0 − A0B0); non-zero = the factors interact. */
  value: number
}

/** Main effects: each level's mean metric minus the grand mean. */
export function mainEffects(
  spec: FactorialSpec,
  result: ExperimentResult,
  levelsByArm: Map<string, Record<string, number>>
): { grandMean: number; factors: FactorEffect[] } {
  const metric = spec.metric
  for (const outcome of result.outcomes) {
    if (typeof outcome.metrics[metric] !== 'number' || !Number.isFinite(outcome.metrics[metric])) {
      throw new Error(`factorial ${spec.id}: metric "${metric}" missing/non-finite for arm "${outcome.arm}"`)
    }
  }
  const grandMean = result.outcomes.reduce((s, o) => s + o.metrics[metric], 0) / result.outcomes.length
  const factors: FactorEffect[] = []
  for (const factor of Object.keys(spec.factors)) {
    const buckets = new Map<number, number[]>()
    for (const outcome of result.outcomes) {
      const level = levelsByArm.get(outcome.arm)?.[factor]
      if (level === undefined) {
        throw new Error(`factorial ${spec.id}: arm "${outcome.arm}" has no level for factor "${factor}"`)
      }
      const list = buckets.get(level) ?? []
      list.push(outcome.metrics[metric])
      buckets.set(level, list)
    }
    const levels = [...buckets.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([level, values]) => {
        const mean = values.reduce((s, v) => s + v, 0) / values.length
        return { level, mean, effect: mean - grandMean }
      })
    factors.push({ factor, levels })
  }
  return { grandMean, factors }
}

/** Pairwise interactions for 2-level factor pairs (difference-in-differences). */
export function interactions(
  spec: FactorialSpec,
  result: ExperimentResult,
  levelsByArm: Map<string, Record<string, number>>
): Interaction[] {
  const meanOf = (factorLevels: Record<string, number>): number => {
    const values: number[] = []
    for (const outcome of result.outcomes) {
      const levels = levelsByArm.get(outcome.arm)
      if (levels === undefined) continue
      const match = Object.entries(factorLevels).every(([f, lv]) => levels[f] === lv)
      if (match) values.push(outcome.metrics[spec.metric])
    }
    if (values.length === 0) throw new Error(`factorial ${spec.id}: empty cell ${JSON.stringify(factorLevels)}`)
    return values.reduce((s, v) => s + v, 0) / values.length
  }
  const twoLevel = Object.keys(spec.factors).filter((f) => spec.factors[f].length === 2)
  const pairs: Interaction[] = []
  for (let i = 0; i < twoLevel.length; i++) {
    for (let j = i + 1; j < twoLevel.length; j++) {
      const A = twoLevel[i]
      const B = twoLevel[j]
      const [a0, a1] = spec.factors[A]
      const [b0, b1] = spec.factors[B]
      const value = (meanOf({ [A]: a1, [B]: b1 }) - meanOf({ [A]: a0, [B]: b1 })) -
        (meanOf({ [A]: a1, [B]: b0 }) - meanOf({ [A]: a0, [B]: b0 }))
      pairs.push({ factorA: A, factorB: B, value })
    }
  }
  return pairs
}

export function runFactorial(
  spec: FactorialSpec,
  systemsFactory: () => GenesisSystem[]
): {
  result: ExperimentResult
  levelsByArm: Map<string, Record<string, number>>
  summaries: MetricSummary[]
  grandMean: number
  factors: FactorEffect[]
  interactions: Interaction[]
  report: string
} {
  const { arms, levelsByArm } = generateArms(spec)
  const config: ExperimentConfig = {
    id: spec.id,
    question: spec.question,
    seeds: spec.seeds,
    population: spec.population,
    years: spec.years,
    arms
  }
  const result = runExperiment(config, systemsFactory, { sampleMetrics: [spec.metric] })
  const summaries = summarize(result, spec.metric)
  const { grandMean, factors } = mainEffects(spec, result, levelsByArm)
  const pairs = interactions(spec, result, levelsByArm)
  const report = formatFactorialReport(spec, summaries, grandMean, factors, pairs)
  return { result, levelsByArm, summaries, grandMean, factors, interactions: pairs, report }
}

const fmt = (v: number): string => String(Math.round(v * 1e6) / 1e6)

export function formatFactorialReport(
  spec: FactorialSpec,
  summaries: MetricSummary[],
  grandMean: number,
  factors: FactorEffect[],
  pairs: Interaction[]
): string {
  const lines: string[] = []
  lines.push(`# Factorial ${spec.id}`)
  lines.push('')
  lines.push(spec.question)
  lines.push('')
  lines.push(`metric: \`${spec.metric}\` · seeds: ${spec.seeds.join(', ')} · population: ${spec.population} · years: ${spec.years}`)
  const gridShape = Object.entries(spec.factors)
    .map(([f, levels]) => `${f}[${levels.join('/')}]`)
    .join(' × ')
  lines.push(`grid: ${gridShape} = ${summaries.reduce((s, x) => s + x.n, 0)} runs`)
  lines.push(`grand mean: ${fmt(grandMean)}`)
  lines.push('')
  lines.push('## Cell means')
  lines.push('```')
  for (const s of summaries) {
    lines.push(`${s.arm}  n=${s.n}  mean=${fmt(s.mean)} ± ${fmt(s.ci95)}`)
  }
  lines.push('```')
  lines.push('')
  lines.push('## Main effects (level mean − grand mean)')
  for (const f of factors) {
    for (const lv of f.levels) {
      lines.push(`${f.factor}=${lv.level}: ${lv.effect >= 0 ? '+' : ''}${fmt(lv.effect)}  (mean ${fmt(lv.mean)})`)
    }
  }
  lines.push('')
  lines.push('## Pairwise interactions (2-level factors, difference-in-differences)')
  if (pairs.length === 0) lines.push('(no 2-level factor pairs)')
  for (const p of pairs) {
    lines.push(`${p.factorA} × ${p.factorB}: ${p.value >= 0 ? '+' : ''}${fmt(p.value)}`)
  }
  return lines.join('\n')
}

/** Catalog of factorial studies (companion to EXPERIMENTS). */
export const FACTORIALS: Record<string, FactorialSpec> = {
  'FTX-001': {
    id: 'FTX-001',
    question:
      'How do income tax rate, welfare transfer and school funding LEVELS interact on cohort ' +
      'stress — welfare softens strain directly while school funding needs a pool SURPLUS the ' +
      'welfare arm never leaves? Grid: incomeTaxRate[0, 0.1] × welfareTransferCents[0, 250000] × ' +
      'schoolFundingPerPupilCents[100000, 400000]. Model-internal only.',
    seeds: [42, 43, 44],
    population: 150,
    years: 2,
    metric: 'stress.mean',
    factors: {
      incomeTaxRate: [0, 0.1],
      welfareTransferCents: [0, 250_000],
      schoolFundingPerPupilCents: [100_000, 400_000]
    }
  },
  'FTX-002': {
    id: 'FTX-002',
    question:
      'CENTURY_REPORT follow-up: the 10k society collapses demographically within a century ' +
      '(survival 5.2-6.4% on 4/4 seeds) because births require MARRIED women aged 18-45 and the ' +
      'spouse pool shrinks. Does raising birthProbabilityPerMonth avert the collapse, and does ' +
      'taxation (pool strain) interact with it? Metric is the FINAL alive population after 30y ' +
      '(collapse is visible by then on 4/4 seeds). Grid: birthProbabilityPerMonth' +
      '[0.008 (default), 0.02, 0.04] × incomeTaxRate[0, 0.1], 30-year horizon. Model-internal only.',
    seeds: [42, 43, 44],
    population: 150,
    years: 30,
    metric: 'population.alive',
    factors: {
      birthProbabilityPerMonth: [0.008, 0.02, 0.04],
      incomeTaxRate: [0, 0.1]
    }
  }
}
