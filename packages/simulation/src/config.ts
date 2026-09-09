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
  /** Population-level extraversion shift [-1, 1] applied after trait
   * generation (experiment knob for guide EXP-006: extraversion → network
   * growth). 0 = unbiased. */
  extraversionBias: number
  /** Mid-run economic shock (guide EXP-001): at the start of simulated year
   * `atYear`, a single layoff wave removes `layoffShare` of all employed
   * residents (reason 'economic_shock'). Optional — absent = no shock. */
  economicShock?: EconomicShock
  /** Rehire friction (GEN-151b): months a resident must stay unemployed
   * before job search eligibility. 0 = no friction (legacy behavior).
   * Models real labor-market matching delays; makes shock effects persist. */
  rehireCooldownMonths: number
  /** Population-level community support shift [-1, 1] added to every
   * resident's social support input (experiment knob for guide EXP-003:
   * social support moderates stress). 0 = unbiased. */
  communitySupportBias: number
  /** Housing cost scenario multiplier [0.1, 5] applied to assigned rent
   * (experiment knob for guide EXP-004: housing burden → wellbeing).
   * 1 = baseline. */
  housingCostMultiplier: number
  /** Employer wage spread multiplier [0.1, 1.5] for guide EXP-029 (wage
   * inequality sweep). Scales the VARIANCE of generated employer wages around
   * the same mean; 1 (or absent) = legacy distribution. Optional: absent keeps
   * the config hash unchanged for non-users (economicShock pattern). */
  wageSpreadMultiplier?: number
}

export interface EconomicShock {
  /** Simulated year (1-based) whose first month boundary fires the shock. */
  atYear: number
  /** Share of currently employed residents laid off, in [0, 1]. */
  layoffShare: number
}

export const DEFAULT_CONFIG: SimulationConfig = {
  seed: 42,
  populationTarget: 1_000,
  years: 1,
  birthProbabilityPerMonth: 0.008,
  employmentRate: 0.62,
  extraversionBias: 0,
  rehireCooldownMonths: 0,
  communitySupportBias: 0,
  housingCostMultiplier: 1
}

export function normalizeConfig(partial: Partial<SimulationConfig>): SimulationConfig {
  const merged: SimulationConfig = { ...DEFAULT_CONFIG, ...partial }
  // optional scenario knobs: explicitly-passed undefined must equal absent,
  // otherwise configHash (and thus the whole random landscape) would diverge
  // between callers that omit the key and callers that pass undefined
  for (const key of ['economicShock', 'wageSpreadMultiplier'] as const) {
    if (merged[key] === undefined) delete merged[key]
  }
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
  if (!Number.isFinite(merged.extraversionBias) || merged.extraversionBias < -1 || merged.extraversionBias > 1) {
    throw new Error(`extraversionBias out of [-1,1]: ${merged.extraversionBias}`)
  }
  if (!Number.isInteger(merged.rehireCooldownMonths) || merged.rehireCooldownMonths < 0 || merged.rehireCooldownMonths > 24) {
    throw new Error(`rehireCooldownMonths must be an integer in [0, 24], got ${merged.rehireCooldownMonths}`)
  }
  if (!Number.isFinite(merged.communitySupportBias) || merged.communitySupportBias < -1 || merged.communitySupportBias > 1) {
    throw new Error(`communitySupportBias out of [-1,1]: ${merged.communitySupportBias}`)
  }
  if (!(Number.isFinite(merged.housingCostMultiplier) && merged.housingCostMultiplier >= 0.1 && merged.housingCostMultiplier <= 5)) {
    throw new Error(`housingCostMultiplier out of [0.1, 5]: ${merged.housingCostMultiplier}`)
  }
  if (merged.wageSpreadMultiplier !== undefined) {
    const spread = merged.wageSpreadMultiplier
    if (!(Number.isFinite(spread) && spread >= 0.1 && spread <= 1.5)) {
      throw new Error(`wageSpreadMultiplier out of [0.1, 1.5]: ${spread}`)
    }
  }
  if (merged.economicShock !== undefined) {
    const shock = merged.economicShock
    if (!Number.isInteger(shock.atYear) || shock.atYear < 1) {
      throw new Error(`economicShock.atYear must be a positive integer, got ${shock.atYear}`)
    }
    if (!(Number.isFinite(shock.layoffShare) && shock.layoffShare >= 0 && shock.layoffShare <= 1)) {
      throw new Error(`economicShock.layoffShare out of [0,1]: ${shock.layoffShare}`)
    }
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
