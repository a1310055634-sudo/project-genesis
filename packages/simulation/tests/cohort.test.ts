import { describe, expect, it } from 'vitest'
import { cohortDecadeOf, demographicsSystem, Simulation } from '@genesis/simulation'

/**
 * Birth-cohort analytics (Roadmap A4): per-decade alive/wealth/employment
 * gauges stamped by the demographics monthly pass; dead cohorts zero out
 * instead of freezing.
 */
function build(years: number) {
  return Simulation.create({ seed: 42, populationTarget: 150, years }, { systems: [demographicsSystem] })
}

function cohortGauges(sim: Simulation): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(sim.ctx.metrics.snapshot())) {
    if (key.startsWith('cohort.')) out[key] = value
  }
  return out
}

describe('birth-cohort analytics (A4)', () => {
  it('stamps per-decade gauges; founders form a negative-decade cohort', () => {
    const sim = build(1)
    sim.run()
    const gauges = cohortGauges(sim)
    const aliveKeys = Object.keys(gauges).filter((k) => k.endsWith('.alive'))
    expect(aliveKeys.length).toBeGreaterThan(0)
    // generation-0 founders were born before tick 0 → negative decade
    expect(aliveKeys.some((k) => k.startsWith('cohort.d-'))).toBe(true)
    for (const [key, value] of Object.entries(gauges)) {
      expect(Number.isFinite(value)).toBe(true)
      if (key.endsWith('.employment_rate')) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
    // at least one living cohort; zeroed (dead-out) cohorts must be
    // consistently all-zero — the anti-freeze guarantee (A4)
    expect(aliveKeys.some((k) => gauges[k] > 0)).toBe(true)
    for (const key of aliveKeys) {
      if (gauges[key] !== 0) continue
      const base = key.slice(0, -'.alive'.length)
      expect(gauges[`${base}mean_wealth_cents`]).toBe(0)
      expect(gauges[`${base}employment_rate`]).toBe(0)
    }
    expect(gauges['cohort.tracked']).toBeGreaterThan(0)
  })

  it('cohort decade helper matches the gauge key arithmetic', () => {
    expect(cohortDecadeOf({ birthTick: 0 })).toBe(0)
    expect(cohortDecadeOf({ birthTick: -86_400 })).toBe(-1)
    expect(cohortDecadeOf({ birthTick: 86_399 })).toBe(0)
    expect(cohortDecadeOf({ birthTick: 86_400 })).toBe(1)
  })

  it('is deterministic under a fixed seed', () => {
    const run = () => {
      const sim = build(1)
      sim.run()
      return sim.digest()
    }
    expect(run()).toBe(run())
  })
})
