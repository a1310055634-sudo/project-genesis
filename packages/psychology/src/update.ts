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
 * - caregiverLoad (GEN-072) enters as a chronic stressor term plus a rest
 *   drain; it ignores which parent carries the load, co-parent sharing,
 *   child temperament, and any joy of parenting (only the cost is modeled).
 */
const COPING_BASE = 0.3
const COPING_GAIN = 0.4

const REST_RECOVERY_PER_DAY = 0.06
const SOCIAL_RECOVERY_PER_DAY = 0.04
/** High stress hinders recovery: at stress 1 only half of the base rate applies. */
const STRESS_RECOVERY_HINDRANCE = 0.5

/**
 * Caregiver rest drain (GEN-072): extra needRest decay per day at load 1,
 * modulated by neuroticism (sensitive parents sleep worse). Range:
 * 0.02 * [0.75, 1.25] = 0.015-0.025/day — within the 0.01-0.03 budget.
 */
const CAREGIVER_REST_DRAIN = 0.02
const CAREGIVER_NEURO_SENS_BASE = 0.75
const CAREGIVER_NEURO_SENS_GAIN = 0.5

/**
 * Environmental/psychosocial context for one person's day, all in [0, 1].
 * caregiverLoad is optional and backward compatible: undefined = 0 (no
 * young children to raise), producing byte-identical behavior to pre-GEN-072.
 */
export interface PsychEnvironment {
  financialStrain: number
  occupationalStrain: number
  relationshipConflict: number
  socialSupport: number
  adverseEvents: number
  /** Share-of-maximum childcare burden; 0 = none, 1 = saturating (see caregiverLoadOf). */
  caregiverLoad?: number
}

/**
 * Convenience mapping for integration bridges (GEN-072): childcare burden
 * grows linearly with the number of young children and saturates at two
 * (two or more toddlers = maximal load; more children add no extra model
 * weight). Negative counts are clamped to 0.
 */
export function caregiverLoadOf(youngChildren: number): number {
  if (!(youngChildren > 0)) return 0
  return Math.min(1, youngChildren / 2)
}

/** In-place daily update of person.psychology. Deterministic given (env, rng). */
export function dailyPsychologyUpdate(person: Person, env: PsychEnvironment, rng: Rng): void {
  const psych = person.psychology
  const caregiverLoad = env.caregiverLoad ?? 0

  // 1) stress (consumes the day's randomness — keep first for a stable draw order);
  //    caregiverLoad rides the standard stressor pathway (neuroticism-modulated)
  psych.stress = updateStress(person.personality, psych.stress, {
    financialStrain: env.financialStrain,
    relationshipConflict: env.relationshipConflict,
    occupationalStrain: env.occupationalStrain,
    adverseEvents: env.adverseEvents,
    socialSupport: env.socialSupport,
    copingResources: clamp01(COPING_BASE + COPING_GAIN * person.personality.conscientiousness),
    caregiverLoad
  }, rng)

  // 2) mood/arousal relax toward baseline
  decayAffect(psych, 1)

  // 3) needs wear down
  decayNeeds(psych, 1)

  // 3b) caregiver rest drain (GEN-072): raising young children erodes sleep;
  //     when caregiverLoad is 0 the subtracted term is exactly 0 (no-op)
  const caregiverSens = CAREGIVER_NEURO_SENS_BASE + CAREGIVER_NEURO_SENS_GAIN * person.personality.neuroticism
  psych.needRest = clamp01(psych.needRest - CAREGIVER_REST_DRAIN * caregiverLoad * caregiverSens)

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
