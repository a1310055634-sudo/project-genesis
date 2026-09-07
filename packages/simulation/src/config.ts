import { digest, stableStringify } from '@genesis/shared'

export interface SimulationConfig {
  /** Any finite number or string; hashed into the RNG seed. */
  seed: number | string
  /** Number of residents to generate at tick 0. */
  populationTarget: number
  /** Simulated years to run. */
  years: number
  /** Monthly birth probability per eligible household. */
  birthProbabilityPerMonth: number
  /** Share of employable adults holding jobs at generation time. */
  employmentRate: number
}

export const DEFAULT_CONFIG: SimulationConfig = {
  seed: 42,
  populationTarget: 1_000,
  years: 1,
  birthProbabilityPerMonth: 0.008,
  employmentRate: 0.62
}

export function normalizeConfig(partial: Partial<SimulationConfig>): SimulationConfig {
  const merged: SimulationConfig = { ...DEFAULT_CONFIG, ...partial }
  if (!Number.isInteger(merged.populationTarget) || merged.populationTarget <= 0) {
    throw new Error(`populationTarget must be a positive integer, got ${merged.populationTarget}`)
  }
  if (!Number.isFinite(merged.years) || merged.years <= 0) {
    throw new Error(`years must be a positive number, got ${merged.years}`)
  }
  if (!(merged.birthProbabilityPerMonth >= 0 && merged.birthProbabilityPerMonth <= 1)) {
    throw new Error(`birthProbabilityPerMonth out of [0,1]: ${merged.birthProbabilityPerMonth}`)
  }
  if (!(merged.employmentRate >= 0 && merged.employmentRate <= 1)) {
    throw new Error(`employmentRate out of [0,1]: ${merged.employmentRate}`)
  }
  return merged
}

/** Stable config hash for run manifests (guide §28). */
export function configHash(config: SimulationConfig): string {
  return digest(config)
}

/** Serialize a config deterministically (e.g. for logging). */
export function configToJson(config: SimulationConfig): string {
  return stableStringify(config)
}
