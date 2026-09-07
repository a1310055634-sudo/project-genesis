import { PsychologyState } from '@genesis/simulation'

export type NeedKey = 'needRest' | 'needSocial' | 'needEsteem'

/**
 * Needs dynamics (drive-reduction inspired: satisfaction decays without
 * investment and is restored by events; guide §6.1 — computational model,
 * not a clinical scale).
 *
 * Exponential decay: value *= (1 - RATE)^days. Rates differ per need
 * (rest is most urgent, esteem most durable). Update frequency: daily
 * (fractional days allowed); deterministic — no randomness.
 *
 * Known simplification: decay is person-independent (no trait moderation,
 * no age effects) and needs do not interact with each other directly.
 */
const REST_DECAY_PER_DAY = 0.04
const SOCIAL_DECAY_PER_DAY = 0.03
const ESTEEM_DECAY_PER_DAY = 0.02

/** Decay all needs over `days` simulated days, clamped to [0, 1]. */
export function decayNeeds(psych: PsychologyState, days: number): void {
  if (!(days > 0)) return
  psych.needRest = clamp01(psych.needRest * Math.pow(1 - REST_DECAY_PER_DAY, days))
  psych.needSocial = clamp01(psych.needSocial * Math.pow(1 - SOCIAL_DECAY_PER_DAY, days))
  psych.needEsteem = clamp01(psych.needEsteem * Math.pow(1 - ESTEEM_DECAY_PER_DAY, days))
}

/** Add `amount` to one need (negative amounts allowed), clamped to [0, 1]. */
export function satisfyNeed(psych: PsychologyState, need: NeedKey, amount: number): void {
  psych[need] = clamp01(psych[need] + amount)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}
