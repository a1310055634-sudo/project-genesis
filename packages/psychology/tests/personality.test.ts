import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'
import { generatePersonality } from '@genesis/psychology'

const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sxx += xs[i] * xs[i]
    syy += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
  }
  const cov = sxy - (sx * sy) / n
  const vx = sxx - (sx * sx) / n
  const vy = syy - (sy * sy) / n
  return cov / Math.sqrt(vx * vy)
}

describe('generatePersonality', () => {
  it('keeps every trait in [0, 1] across many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePersonality(createRng(seed))
      for (const trait of TRAITS) {
        expect(Number.isFinite(p[trait])).toBe(true)
        expect(p[trait]).toBeGreaterThanOrEqual(0)
        expect(p[trait]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is reproducible under the same seed', () => {
    const a = Array.from({ length: 50 }, () => generatePersonality(createRng('repro')))
    const b = Array.from({ length: 50 }, () => generatePersonality(createRng('repro')))
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    const a = Array.from({ length: 20 }, () => generatePersonality(createRng(1)))
    const b = Array.from({ length: 20 }, () => generatePersonality(createRng(2)))
    expect(a).not.toEqual(b)
  })

  it('produces correlated traits (two-factor model, not independent uniforms)', () => {
    const n = 500
    const rng = createRng('correlation')
    const samples: Record<(typeof TRAITS)[number], number[]> = {
      openness: [],
      conscientiousness: [],
      extraversion: [],
      agreeableness: [],
      neuroticism: []
    }
    for (let i = 0; i < n; i++) {
      const p = generatePersonality(rng)
      for (const t of TRAITS) samples[t].push(p[t])
    }
    let maxAbsR = 0
    for (let i = 0; i < TRAITS.length; i++) {
      for (let j = i + 1; j < TRAITS.length; j++) {
        const r = Math.abs(pearson(samples[TRAITS[i]], samples[TRAITS[j]]))
        maxAbsR = Math.max(maxAbsR, r)
      }
    }
    // independent uniforms would give |r| ~ 1/sqrt(500) ≈ 0.045; the shared
    // factors push at least one pair well beyond that
    expect(maxAbsR).toBeGreaterThan(0.1)
  })
})
