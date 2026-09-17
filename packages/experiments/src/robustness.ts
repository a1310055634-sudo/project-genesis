import type { ExperimentResult } from './runner'
import { ci95HalfWidth, mean, stdDev } from './stats'

/**
 * Seed stability (Roadmap C2, GEN-151 deepening): a pooled cross-arm mean can
 * hide fragile effects — an effect that flips sign on half the seeds is not a
 * finding. For every non-baseline arm, the per-seed effect vs the baseline
 * arm is computed FIRST, then aggregated: how big is it, how noisy, and what
 * share of seeds agree on the direction.
 */

export interface SeedEffect {
  seed: number | string
  /** treatment mean − control mean, within this seed's paired world. */
  effect: number
}

export interface ArmSeedStability {
  arm: string
  baseline: string
  perSeed: SeedEffect[]
  n: number
  meanEffect: number
  stdDev: number
  ci95: number
  /** share of seeds whose per-seed effect sign matches the mean effect's sign */
  agreementShare: number
  /** seeds whose effect sign OPPOSES the mean effect's sign */
  flippedSeeds: Array<seedAndEffect>
}

interface seedAndEffect {
  seed: number | string
  effect: number
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0
}

/**
 * Per-seed paired effects of every non-baseline arm against arms[0], pooled
 * from a single runExperiment result. Throws when a (arm, seed) cell is
 * missing — partial grids would silently bias the stability stats.
 */
export function seedStability(result: ExperimentResult, metric: string): ArmSeedStability[] {
  const baseline = result.config.arms[0]?.name
  if (baseline === undefined) throw new Error('seedStability: experiment has no baseline arm')
  const cell = new Map<string, number>() // `${arm}|${seed}` → metric
  for (const outcome of result.outcomes) {
    const v = outcome.metrics[metric]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`seedStability: metric "${metric}" missing/non-finite for arm "${outcome.arm}" seed ${outcome.seed}`)
    }
    cell.set(`${outcome.arm}|${outcome.seed}`, v)
  }
  const seeds = result.config.seeds
  const out: ArmSeedStability[] = []
  for (const arm of result.config.arms.slice(1)) {
    const perSeed: SeedEffect[] = []
    for (const seed of seeds) {
      const t = cell.get(`${arm.name}|${seed}`)
      const c = cell.get(`${baseline}|${seed}`)
      if (t === undefined || c === undefined) {
        throw new Error(`seedStability: missing cell arm="${arm.name}" seed=${seed}`)
      }
      perSeed.push({ seed, effect: t - c })
    }
    const effects = perSeed.map((p) => p.effect)
    const meanEffect = mean(effects)
    const expected = sign(meanEffect)
    const agreeing = perSeed.filter((p) => sign(p.effect) === expected || p.effect === 0)
    const flipped = perSeed.filter((p) => p.effect !== 0 && sign(p.effect) !== expected).map((p) => ({ seed: p.seed, effect: p.effect }))
    out.push({
      arm: arm.name,
      baseline,
      perSeed,
      n: perSeed.length,
      meanEffect,
      stdDev: stdDev(effects),
      ci95: ci95HalfWidth(effects),
      agreementShare: perSeed.length === 0 ? 0 : agreeing.length / perSeed.length,
      flippedSeeds: flipped
    })
  }
  return out
}

export function formatSeedStability(stability: ArmSeedStability[], metric: string): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`## Seed stability (${metric}, per-seed paired effect vs baseline)`)
  for (const s of stability) {
    lines.push(
      `${s.arm} vs ${s.baseline}: effect ${mean1(s.meanEffect)} ± ${mean1(s.ci95)} (n=${s.n}) · agreement ${(s.agreementShare * 100).toFixed(0)}%`
    )
    for (const p of s.perSeed) lines.push(`  seed ${p.seed}: ${mean1(p.effect)}`)
    for (const f of s.flippedSeeds) lines.push(`  ⚠ seed ${f.seed} FLIPPED (${mean1(f.effect)})`)
  }
  return lines.join('\n')
}

function mean1(v: number): string {
  return String(Math.round(v * 1e6) / 1e6)
}
