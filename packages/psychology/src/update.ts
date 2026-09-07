import { Rng } from '@genesis/core'
import { Person } from '@genesis/simulation'
import { decayAffect } from './affect'
import { decayNeeds } from './needs'
import { updateStress } from './stress'
import { computeWellbeing } from './wellbeing'

/**
 * Daily psychology composition (guide §6.1 — theory-inspired computational
 * model, NOT a clinical instrument). One call = one simulated day for one
 * person. Order matters and is deterministic:
 *   1. stress update (the single rng draw of the day)
 *   2. affect decay toward neutral baseline
 *   3. need decay
 *   4. basic daily need recovery (rest/social, hindered by stress)
 *   5. wellbeing synthesis written back to psych.wellbeing
 *
 * Known simplifications:
 * - copingResources is derived solely from conscientiousness
 *   (COPING_BASE + COPING_GAIN * conscientiousness); skill, wealth and
 *   social resources are ignored here — the economy/social packages can
 *   later feed richer inputs via PsychEnvironment.
 * - affect baseline is a fixed 0 (neutral); no person-specific hedonic
 *   setpoint yet.
 * - esteem has no automatic daily recovery; it rises only via satisfyNeed
 *   calls from event-driven systems (achievements, recognition).
 */
const COPING_BASE = 0.3
const COPING_GAIN = 0.4

const REST_RECOVERY_PER_DAY = 0.06
const SOCIAL_RECOVERY_PER_DAY = 0.04
/** High stress hinders recovery: at stress 1 only half of the base rate applies. */
const STRESS_RECOVERY_HINDRANCE = 0.5

/** Environmental/psychosocial context for one person's day, all in [0, 1]. */
export interface PsychEnvironment {
  financialStrain: number
  occupationalStrain: number
  relationshipConflict: number
  socialSupport: number
  adverseEvents: number
}

/** In-place daily update of person.psychology. Deterministic given (env, rng). */
export function dailyPsychologyUpdate(person: Person, env: PsychEnvironment, rng: Rng): void {
  const psych = person.psychology

  // 1) stress (consumes the day's randomness — keep first for a stable draw order)
  psych.stress = updateStress(person.personality, psych.stress, {
    financialStrain: env.financialStrain,
    relationshipConflict: env.relationshipConflict,
    occupationalStrain: env.occupationalStrain,
    adverseEvents: env.adverseEvents,
    socialSupport: env.socialSupport,
    copingResources: clamp01(COPING_BASE + COPING_GAIN * person.personality.conscientiousness)
  }, rng)

  // 2) mood/arousal relax toward baseline
  decayAffect(psych, 1)

  // 3) needs wear down
  decayNeeds(psych, 1)

  // 4) basic daily recovery, impaired under high stress
  const recoveryFactor = 1 - STRESS_RECOVERY_HINDRANCE * psych.stress
  psych.needRest = clamp01(psych.needRest + REST_RECOVERY_PER_DAY * recoveryFactor)
  psych.needSocial = clamp01(psych.needSocial + SOCIAL_RECOVERY_PER_DAY * recoveryFactor)

  // 5) wellbeing synthesis
  psych.wellbeing = computeWellbeing(psych)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}
