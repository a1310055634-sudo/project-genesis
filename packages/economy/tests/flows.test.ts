import { describe, it, expect } from 'vitest'
import { createRng, SimulationEvent } from '@genesis/core'
import { demographicsSystem, GenesisSystem, nextDayStart, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'

/**
 * Money-integrity and flow-accounting tests (guide §4.5): wealth stays a
 * non-negative integer at all times, and no cent is created or destroyed by
 * the payroll/consumption pair.
 */

/** Daily probe running AFTER the economy systems (priority > 22). */
function wealthProbe(violations: { count: number }): GenesisSystem {
  return {
    id: 'test.wealth-probe',
    priority: 25,
    nextFireTick: nextDayStart,
    run(ctx) {
      for (const person of ctx.world.persons) {
        const wealth = person.economy.wealthCents
        if (person.alive && (!Number.isInteger(wealth) || wealth < 0)) violations.count++
      }
    }
  }
}

describe('money integrity (3 years, 200 residents)', () => {
  it('wealth stays a non-negative integer for every alive person at every daily probe', () => {
    const violations = { count: 0 }
    const sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 3 },
      { systems: [demographicsSystem, ...economySystems(), wealthProbe(violations)] }
    )
    sim.run()

    for (const person of sim.ctx.world.persons) {
      if (!person.alive) continue
      expect(Number.isInteger(person.economy.wealthCents)).toBe(true)
      expect(person.economy.wealthCents).toBeGreaterThanOrEqual(0)
    }
    expect(violations.count).toBe(0)
  }, 60_000)

  it('a random sample of 50 survivors has valid integer wealth', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 3 },
      { systems: [demographicsSystem, ...economySystems()] }
    )
    sim.run()
    const alive = sim.ctx.world.persons.filter((p) => p.alive)
    const rng = createRng('wealth-sample')
    const sample = rng.shuffle([...alive]).slice(0, 50)
    expect(sample).toHaveLength(50)
    for (const person of sample) {
      expect(Number.isInteger(person.economy.wealthCents)).toBe(true)
      expect(person.economy.wealthCents).toBeGreaterThanOrEqual(0)
    }
  }, 60_000)
})

describe('income/consumption accounting (2 years, 50 residents)', () => {
  // Assumptions, recorded deliberately:
  // - payroll adds exactly sum(income.received.amountCents) to total wealth;
  // - consumption subtracts exactly sum(consumption.paid.amountCents);
  // - job changes (hire/retire/death release) never move wealth, and dead
  //   residents keep their wealth in place;
  // - residents born during the run start with wealthCents = 0.
  // Therefore: incomeSum - consumptionSum === totalWealth(end) - totalWealth(start),
  // summed over ALL persons (alive + dead), exactly, with no tolerance.
  it('income events minus consumption events equals the total wealth delta', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 50, years: 2 },
      { systems: [demographicsSystem, ...economySystems()] }
    )

    let incomeSum = 0
    let consumptionSum = 0
    sim.ctx.events.onAny((event: SimulationEvent) => {
      const payload = event.payload as { amountCents?: number } | undefined
      if (event.type === 'income.received' && payload?.amountCents !== undefined) {
        expect(Number.isInteger(payload.amountCents)).toBe(true)
        incomeSum += payload.amountCents
      } else if (event.type === 'consumption.paid' && payload?.amountCents !== undefined) {
        expect(Number.isInteger(payload.amountCents)).toBe(true)
        consumptionSum += payload.amountCents
      }
    })

    const totalWealth = () =>
      sim.ctx.world.persons.reduce((sum, p) => sum + p.economy.wealthCents, 0)

    const before = totalWealth()
    sim.run()
    const after = totalWealth()

    expect(incomeSum).toBeGreaterThan(0) // payroll actually ran
    expect(consumptionSum).toBeGreaterThan(0) // consumption actually ran
    expect(incomeSum - consumptionSum).toBe(after - before)
  }, 60_000)
})
