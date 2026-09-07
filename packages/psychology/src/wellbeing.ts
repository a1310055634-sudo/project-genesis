import { PsychologyState } from '@genesis/simulation'

/**
 * Subjective wellbeing synthesis (hedonic-adaptation inspired: affect tone,
 * felt stress and need satisfaction each contribute a fixed share; guide
 * §6.1 — computational model, NOT a clinical wellbeing scale).
 *
 *   wellbeing = W_VALENCE * (affectValence + 1) / 2   // map [-1,1] -> [0,1]
 *             + W_STRESS  * (1 - stress)
 *             + W_NEEDS   * mean(needRest, needSocial, needEsteem)
 *
 * Weights sum to 1 so the result lives in [0, 1]; clamped anyway. Pure and
 * deterministic; recomputed daily by dailyPsychologyUpdate.
 */
const W_VALENCE = 0.4
const W_STRESS = 0.35
const W_NEEDS = 0.25

export function computeWellbeing(psych: PsychologyState): number {
  const valence01 = (psych.affectValence + 1) / 2
  const needsMean = (psych.needRest + psych.needSocial + psych.needEsteem) / 3
  return clamp01(W_VALENCE * valence01 + W_STRESS * (1 - psych.stress) + W_NEEDS * needsMean)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}
