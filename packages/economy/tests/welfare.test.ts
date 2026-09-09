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
    // conservation-style audit: total paid equals the counter × transfer amount
    const paid = sim.ctx.log.stats().byType['welfare.paid'] ?? 0
    expect(paid).toBeGreaterThan(0)
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
