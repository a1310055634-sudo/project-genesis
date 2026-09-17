import { describe, expect, it } from 'vitest'
import { ExperimentResult } from '../src/runner'
import { formatSeedStability, seedStability } from '../src/robustness'
import type { ExperimentArm } from '../src/config'

/** Seed stability (Roadmap C2): per-seed paired effects vs pooled means —
 * sign flips must be surfaced, not averaged away. */

function result(seeds: number[], effectBySeed: Record<number, number>): ExperimentResult {
  const arms: ExperimentArm[] = [
    { name: 'control', overrides: {} },
    { name: 'treatment', overrides: { incomeTaxRate: 0.1 } }
  ]
  const outcomes = []
  for (const arm of arms) {
    for (const seed of seeds) {
      outcomes.push({
        arm: arm.name,
        seed,
        alive: 100,
        population: 100,
        digest: 'd',
        runtimeMs: 0,
        // control stress 0.5 constant; treatment = 0.5 + effectBySeed[seed]
        metrics: { stress: arm.name === 'control' ? 0.5 : 0.5 + effectBySeed[seed] }
      })
    }
  }
  return {
    config: { id: 'T', question: 'q', seeds, population: 100, years: 1, arms },
    outcomes
  } as unknown as ExperimentResult
}

describe('seedStability (C2)', () => {
  it('pools per-seed paired effects and reports agreement', () => {
    const s = seedStability(result([1, 2, 3], { 1: -0.05, 2: -0.04, 3: -0.06 }), 'stress')
    expect(s.length).toBe(1)
    expect(s[0].arm).toBe('treatment')
    const effects = s[0].perSeed.map((p) => p.effect)
    expect(effects[0]).toBeCloseTo(-0.05, 12)
    expect(effects[1]).toBeCloseTo(-0.04, 12)
    expect(effects[2]).toBeCloseTo(-0.06, 12)
    expect(s[0].meanEffect).toBeCloseTo(-0.05, 12)
    expect(s[0].agreementShare).toBe(1)
    expect(s[0].flippedSeeds).toEqual([])
  })

  it('surfaces sign flips instead of averaging them away', () => {
    const s = seedStability(result([1, 2, 3, 4], { 1: -0.05, 2: -0.05, 3: 0.04, 4: -0.06 }), 'stress')
    const a = s[0]
    expect(a.agreementShare).toBe(0.75)
    expect(a.flippedSeeds.length).toBe(1)
    expect(a.flippedSeeds[0].seed).toBe(3)
    expect(a.flippedSeeds[0].effect).toBeCloseTo(0.04, 12)
    const text = formatSeedStability(s, 'stress')
    expect(text).toContain('agreement 75%')
    expect(text).toContain('FLIPPED')
  })

  it('throws on partial grids instead of biasing the stats', () => {
    const partial = result([1, 2], { 1: -0.05, 2: -0.04 })
    // drop the control cell for seed 2 → (control|2) missing
    partial.outcomes = partial.outcomes.filter((o) => !(o.arm === 'control' && o.seed === 2))
    expect(() => seedStability(partial, 'stress')).toThrow(/missing cell/)
  })
})
