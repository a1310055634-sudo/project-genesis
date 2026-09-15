import { describe, expect, it } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { institutionsSystem, SCHOOLS } from '@genesis/institutions'
/**
 * School funding loop (RT6-D1-3 follow-up / HANDOFF 住房资金循环): per-pupil
 * funding drawn from the taxation pool (pool-first, deficit audited) drives
 * monthly school-quality drift; crowding erodes quality; capacity headroom
 * absorbs the aging-in cohort.
 */

function buildFunded(poolValue: number) {
  const pool = { value: poolValue }
  const sim = Simulation.create(
    { seed: 42, populationTarget: 150, years: 2 },
    {
      systems: [
        demographicsSystem,
        institutionsSystem({
          getTaxPool: () => pool.value,
          setTaxPool: (_ctx, v: number) => {
            pool.value = v
          }
        })
      ]
    }
  )
  return { pool, sim }
}

function meanQuality(sim: Simulation): number {
  const schools = sim.ctx.extensions.get(SCHOOLS) as Map<string, { quality: number }>
  let sum = 0
  for (const school of schools.values()) sum += school.quality
  return sum / schools.size
}

describe('school funding loop', () => {
  it('a solvent pool funds schools fully: quality drifts up, deficit stays zero', () => {
    const { sim } = buildFunded(1_000_000_000)
    sim.run()
    expect(meanQuality(sim)).toBeGreaterThan(0.7)
    expect(sim.ctx.metrics.counterValue('institutions.funding_paid_cents')).toBeGreaterThan(0)
    expect(sim.ctx.metrics.gaugeValue('institutions.funding_deficit_cents')).toBe(0)
    expect(sim.ctx.metrics.gaugeValue('institutions_funding_ratio')).toBe(1)
  })

  it('an empty pool leaves schools unfunded: quality erodes, deficit audited', () => {
    const { sim } = buildFunded(0)
    sim.run()
    expect(meanQuality(sim)).toBeLessThan(0.5)
    expect(sim.ctx.metrics.counterValue('institutions.funding_paid_cents')).toBe(0)
    expect(sim.ctx.metrics.gaugeValue('institutions.funding_deficit_cents')).toBeGreaterThan(0)
    expect(sim.ctx.metrics.gaugeValue('institutions_funding_ratio')).toBe(0)
  })

  it('the pool is actually debited by the funding draw (integration with pool accessors)', () => {
    const { pool, sim } = buildFunded(50_000_000)
    sim.run()
    // 2y of monthly bills came out of the injected pool; nothing else touches it
    const paid = sim.ctx.metrics.counterValue('institutions.funding_paid_cents')
    expect(pool.value).toBe(50_000_000 - paid)
    expect(paid).toBeGreaterThan(0)
  })

  it('without deps the funding loop is skipped (standalone runs keep static quality)', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 150, years: 1 },
      { systems: [demographicsSystem, institutionsSystem()] }
    )
    sim.run()
    expect(sim.ctx.metrics.hasCounter('institutions.funding_paid_cents')).toBe(false)
    expect(sim.ctx.metrics.hasGauge('institutions_funding_ratio')).toBe(false)
  })
})
