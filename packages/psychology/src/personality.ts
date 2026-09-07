import { Rng } from '@genesis/core'
import { Personality } from '@genesis/simulation'

/**
 * Personality generation (guide §6.1: theory-inspired computational model,
 * NOT a clinical instrument).
 *
 * Purpose: produce correlated Big-Five profiles from a deterministic Rng.
 *
 * Model: two-latent-factor model inspired by hierarchical trait theory
 * (a stability factor and a social-engagement factor), plus unique noise:
 *
 *   trait = 0.5 + load_stability * f1 + load_engagement * f2 + unique_noise
 *   f1, f2 ~ Uniform(-1, 1);  unique_noise ~ Uniform(-W, W)
 *
 * Factor loadings (chosen so neuroticism/conscientiousness correlate ~ -0.35
 * and extraversion/openness ~ +0.30 — weakly correlated, unlike independent
 * uniforms):
 *   openness:             f2 +0.12
 *   conscientiousness:    f1 +0.15
 *   extraversion:         f2 +0.16
 *   agreeableness:        f1 +0.10, f2 +0.05
 *   neuroticism:          f1 -0.15
 *
 * Known simplifications: exact Big-Five covariance structure is richer
 * (five factors, facet-level variance); here only two latent factors and
 * uniform noise are used, and traits are drawn once at birth (no maturation).
 * Output update frequency: once per person at creation.
 */
const NOISE_HALF_WIDTH = 0.2

export function generatePersonality(rng: Rng): Personality {
  const stability = rng.next() * 2 - 1 // f1 in [-1, 1)
  const engagement = rng.next() * 2 - 1 // f2 in [-1, 1)
  const personality: Personality = {
    openness: clamp01(0.5 + 0.12 * engagement + noise(rng)),
    conscientiousness: clamp01(0.5 + 0.15 * stability + noise(rng)),
    extraversion: clamp01(0.5 + 0.16 * engagement + noise(rng)),
    agreeableness: clamp01(0.5 + 0.1 * stability + 0.05 * engagement + noise(rng)),
    neuroticism: clamp01(0.5 - 0.15 * stability + noise(rng))
  }
  return personality
}

function noise(rng: Rng): number {
  return (rng.next() * 2 - 1) * NOISE_HALF_WIDTH
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
