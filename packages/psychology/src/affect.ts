import { PsychologyState } from '@genesis/simulation'

/**
 * Affect dynamics (circumplex-inspired: valence x arousal; guide §6.1 —
 * theory-inspired computational model, NOT a clinical measure).
 *
 * - applyAffectEvent: instantaneous exogenous push (events, interactions).
 * - decayAffect: exponential return toward baseline each simulated day.
 *
 * Mood inertia (commented coefficient): MOOD_INERTIA is the fraction of the
 * baseline gap that REMAINS after one day (per-day retention). Higher value
 * = stronger inertia = slower mood recovery. 0.7 ⇒ 30% of the gap closes per
 * day, matching the qualitative "mood persists for days" finding without
 * claiming calibrated dynamics.
 */
const MOOD_INERTIA = 0.7
const AROUSAL_INERTIA = 0.6
/** Resting arousal level (calm wakefulness). */
const AROUSAL_BASELINE = 0.2

/** Apply an immediate affective event; clamps to valence [-1,1], arousal [0,1]. */
export function applyAffectEvent(psych: PsychologyState, valenceDelta: number, arousalDelta: number): void {
  let valence = psych.affectValence + valenceDelta
  if (valence > 1) valence = 1
  else if (valence < -1) valence = -1
  psych.affectValence = valence
  psych.affectArousal = clamp01(psych.affectArousal + arousalDelta)
}

/**
 * Exponential decay toward baseline over `days` (may be fractional).
 * valence += (baseline - valence) * (1 - MOOD_INERTIA^days).
 * Deterministic; no randomness (noise enters via applyAffectEvent / stress).
 */
export function decayAffect(psych: PsychologyState, days: number, baselineValence = 0): void {
  if (!(days > 0)) return
  const gapClosed = 1 - Math.pow(MOOD_INERTIA, days)
  let valence = psych.affectValence + (baselineValence - psych.affectValence) * gapClosed
  if (valence > 1) valence = 1
  else if (valence < -1) valence = -1
  psych.affectValence = valence
  psych.affectArousal = clamp01(psych.affectArousal + (AROUSAL_BASELINE - psych.affectArousal) * (1 - Math.pow(AROUSAL_INERTIA, days)))
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}
