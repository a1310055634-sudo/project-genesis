import { describe, expect, it } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'

/**
 * Pool-first accounting across welfare + pension (RT6-D1-1 / RT6-D1-5): both
 * systems settle against THIS month's totals drawn from the shared taxation
 * pool. The cumulative identity below pins the settlement arithmetic — it
 * fails under any regression to cumulative-counter settlement (the RT6-D1-1
 * bug shape, where the pool drained quadratically from month 2 on).
 *
 * Invariant (pool starts at 0; taxation adds, funding subtracts):
 *   welfare_deficit + pension_deficit
 *     == welfare_paid + pension_paid - tax_collected + pool_end
 */
function build() {
  return Simulation.create(
    { seed: 42, populationTarget: 150, years: 3, welfareTransferCents: 250_000, incomeTaxRate: 0.1 },
    { systems: [demographicsSystem, ...economySystems()] }
  )
}

describe('taxation pool accounting (RT6-D1-1/D1-5)', () => {
  it('deficits reconcile with paid/collected/pool-end over a multi-year run', () => {
    const sim = build()
    sim.run()
    const m = sim.ctx.metrics
    const paidWelfare = m.counterValue('economy.welfare_paid_cents')
    const paidPension = m.counterValue('economy.pension_paid_cents')
    const collected = m.counterValue('economy.tax_collected_cents')
    const poolEnd = (sim.ctx.extensions.get('economy.taxPool') as number | undefined) ?? 0
    const deficitSum =
      m.gaugeValue('economy.welfare_deficit_cents') + m.gaugeValue('economy.pension_deficit_cents')
    expect(paidWelfare).toBeGreaterThan(0)
    expect(collected).toBeGreaterThan(0)
    expect(deficitSum).toBe(paidWelfare + paidPension - collected + poolEnd)
  })

  it('pension system pays retirees; founder-bootstrap seniors receive pensions', () => {
    const sim = build()
    sim.run()
    expect(sim.ctx.log.countOf('pension.paid')).toBeGreaterThan(0)
    expect(sim.ctx.metrics.counterValue('economy.pension_paid_cents')).toBeGreaterThan(0)
  })

  it('with no taxation, every welfare cent paid is deficit-created', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 150, years: 2, welfareTransferCents: 250_000 },
      { systems: [demographicsSystem, ...economySystems()] }
    )
    sim.run()
    const m = sim.ctx.metrics
    // the pool stays empty, so each month's payment is fully deficit-created
    expect(m.gaugeValue('economy.welfare_deficit_cents')).toBe(m.counterValue('economy.welfare_paid_cents'))
    expect(m.gaugeValue('economy.welfare_deficit_cents')).toBeGreaterThan(0)
  })
})
