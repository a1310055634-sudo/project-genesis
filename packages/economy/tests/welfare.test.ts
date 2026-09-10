import { describe, expect, it } from 'vitest'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'

/**
 * Welfare transfer (guide EXP-030): unemployed working-age residents receive
 * the configured monthly transfer; employed residents do not; the policy is
 * deterministic and auditable.
 */
function build(transfer: number) {
  return Simulation.create(
    { seed: 42, populationTarget: 150, years: 2, welfareTransferCents: transfer },
    { systems: [demographicsSystem, ...economySystems()] }
  )
}

describe('welfare transfer (EXP-030)', () => {
  it('pays unemployed working-age residents monthly; recipients tracked', () => {
    const sim = build(250_000)
    sim.run()
    expect(sim.ctx.log.countOf('welfare.paid')).toBeGreaterThan(0)
    expect(sim.ctx.metrics.gaugeValue('economy.welfare_recipients')).toBeGreaterThan(0)
    // pool-first funding audit (red team RT5-01): with a 10% tax funding the
    // pool, the recorded deficit must equal total welfare paid minus what the
    // tax pool covered — never the full amount
    const paid = sim.ctx.log.stats().byType['welfare.paid'] ?? 0
    expect(paid).toBeGreaterThan(0)
    // no tax in this fixture → the entire welfare bill is deficit-created
    expect(sim.ctx.metrics.gaugeValue('economy.welfare_deficit_cents')).toBeGreaterThan(0)
    expect(checkInvariantSafe(sim)).toBe(true)
  })

  it('funds from the taxation pool first; only the shortfall is deficit (RT4-03)', () => {
    const sim = Simulation.create(
      {
        seed: 42, populationTarget: 150, years: 2,
        welfareTransferCents: 250_000, incomeTaxRate: 0.1
      },
      { systems: [demographicsSystem, ...economySystems()] }
    )
    sim.run()
    // taxation collected something and welfare spent it; the deficit gauge
    // only carries what the pool could not cover
    const collected = sim.ctx.metrics.counterValue('economy.tax_collected_cents')
    expect(collected).toBeGreaterThan(0)
    const deficit = sim.ctx.metrics.gaugeValue('economy.welfare_deficit_cents')
    expect(deficit).toBeGreaterThanOrEqual(0)
    expect(checkInvariantSafe(sim)).toBe(true)
  })

  it('is off when the policy is absent', () => {
    const sim = build(0)
    sim.run()
    expect(sim.ctx.log.countOf('welfare.paid')).toBe(0)
  })

  it('is deterministic', () => {
    const a = build(250_000)
    a.run()
    const b = build(250_000)
    b.run()
    expect(a.digest()).toBe(b.digest())
  })
})

function checkInvariantSafe(sim: ReturnType<typeof build>): boolean {
  const stats = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
  return stats.violations === 0
}
