import { Rng } from '@genesis/core'
import { Personality } from '@genesis/simulation'

/**
 * Perceived stress update — weighted-delta model (guide §6.1 example; a
 * theory-inspired computational model, NOT a clinical assessment).
 *
 *   stress_delta = sensitivity * ( W_FIN * financial
 *                                 + W_REL * relationshipConflict
 *                                 + W_OCC * occupationalStrain
 *                                 + W_ADV * adverseEvents
 *                                 + W_CAR * caregiverLoad )
 *                  - W_SUP * socialSupport - W_COP * copingResources
 *                  + noise
 *   then homeostatic pull toward RESTING_STRESS, then clamp to [0, 1].
 *
 * - Neuroticism moderates sensitivity to POSITIVE (stressor) terms only:
 *   sensitivity = NEU_SENS_BASE + NEU_SENS_GAIN * neuroticism ∈ [0.7, 1.3]
 *   (high-neuroticism individuals amplify stressor impact).
 * - noise ~ Uniform(-NOISE_HALF_WIDTH, +NOISE_HALF_WIDTH), drawn from `rng`.
 * - Homeostatic pull: stress moves RESTING_RECOVERY of the way toward
 *   RESTING_STRESS each day, so stressors removed ⇒ slow recovery, and
 *   sustained load saturates at 1 rather than diverging.
 * - Chronicity accumulation emerges from the daily delta + clamp ratchet.
 *
 * Update frequency: daily. All inputs expected in [0, 1] (not re-validated).
 */
const W_FINANCIAL = 0.02
const W_RELATIONSHIP = 0.014
const W_OCCUPATIONAL = 0.014
const W_ADVERSE = 0.02
// Caregiving for young children is a chronic low-intensity stressor (GEN-072):
// at load 1 the pre-sensitivity increment is 0.01/day, i.e. 0.007-0.013/day
// after neuroticism modulation — deliberately milder than acute stressors.
const W_CAREGIVER = 0.01
const W_SUPPORT = 0.01
const W_COPING = 0.006

const NEU_SENS_BASE = 0.7
const NEU_SENS_GAIN = 0.6

const NOISE_HALF_WIDTH = 0.01

/** Idiostatic resting stress an unburdened person drifts back to. */
const RESTING_STRESS = 0.15
/** Fraction of the distance to RESTING_STRESS closed per day. */
const RESTING_RECOVERY = 0.03

/** Daily stressor/protective inputs, all in [0, 1]. */
export interface StressInputs {
  financialStrain: number
  relationshipConflict: number
  occupationalStrain: number
  adverseEvents: number
  socialSupport: number
  copingResources: number
  /**
   * Chronic childcare burden in [0, 1] (GEN-072). Optional and backward
   * compatible: undefined is treated exactly as 0 (zero contribution).
   * Neuroticism modulation applies, as to every stressor term.
   */
  caregiverLoad?: number
}

/** Returns the new stress value in [0, 1]; deterministic given (inputs, rng). */
export function updateStress(personality: Personality, currentStress: number, inputs: StressInputs, rng: Rng): number {
  const positive =
    W_FINANCIAL * inputs.financialStrain +
    W_RELATIONSHIP * inputs.relationshipConflict +
    W_OCCUPATIONAL * inputs.occupationalStrain +
    W_ADVERSE * inputs.adverseEvents +
    W_CAREGIVER * (inputs.caregiverLoad ?? 0)
  const negative = W_SUPPORT * inputs.socialSupport + W_COPING * inputs.copingResources
  const sensitivity = NEU_SENS_BASE + NEU_SENS_GAIN * personality.neuroticism
  const noise = (rng.next() * 2 - 1) * NOISE_HALF_WIDTH

  let stress = currentStress + sensitivity * positive - negative + noise
  // homeostatic pull toward resting level (also the recovery trend)
  stress += (RESTING_STRESS - stress) * RESTING_RECOVERY
  return clamp01(stress)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}
