import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'
import { demographicsSystem, EconomyState, Person, Simulation } from '@genesis/simulation'
import { economySystems, financialStrainOf, initialEconomy, recordEconomyMetrics, STRAIN_UNEMPLOYED } from '@genesis/economy'

/** Indicator and initializer tests (GEN-027). */

function makePerson(economy: Partial<EconomyState>, overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-test',
    sex: 'female',
    birthTick: -40 * 8_640,
    alive: true,
    deathTick: null,
    lifeStage: 'adult',
    householdId: null,
    partnerId: null,
    maritalStatus: 'single',
    motherId: null,
    fatherId: null,
    spouseAtDeathId: null,
    personality: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    psychology: {
      affectValence: 0,
      affectArousal: 0.3,
      stress: 0.2,
      needRest: 0.7,
      needSocial: 0.6,
      needEsteem: 0.5,
      wellbeing: 0.5
    },
    economy: { employerId: null, monthlyIncomeCents: 0, wealthCents: 0, lastMonthConsumptionCents: 0, ...economy },
    social: { relationshipIds: [] },
    ...overrides
  }
}

describe('financialStrainOf', () => {
  it('scores an unemployed person at ~0.85, above a high-savings employed person', () => {
    const unemployed = makePerson({ employerId: null, wealthCents: 500_000 })
    const secureEmployee = makePerson({
      employerId: 'employer-1',
      monthlyIncomeCents: 300_000,
      wealthCents: 6_000_000, // > 12 months of runway at ~$1,800/month burn
      lastMonthConsumptionCents: 180_000
    })
    expect(financialStrainOf(unemployed)).toBeCloseTo(0.85, 10)
    expect(financialStrainOf(secureEmployee)).toBe(0)
    expect(financialStrainOf(unemployed)).toBeGreaterThan(financialStrainOf(secureEmployee))
  })

  it('decreases monotonically with wealth runway', () => {
    const burn = 180_000
    const poor = makePerson({ employerId: 'e', monthlyIncomeCents: 300_000, wealthCents: 0, lastMonthConsumptionCents: burn })
    const mid = makePerson({ employerId: 'e', monthlyIncomeCents: 300_000, wealthCents: 5 * burn, lastMonthConsumptionCents: burn })
    const rich = makePerson({ employerId: 'e', monthlyIncomeCents: 300_000, wealthCents: 20 * burn, lastMonthConsumptionCents: burn })
    const strainPoor = financialStrainOf(poor)
    const strainMid = financialStrainOf(mid)
    const strainRich = financialStrainOf(rich)
    expect(strainPoor).toBeGreaterThan(strainMid)
    expect(strainMid).toBeGreaterThan(strainRich)
    expect(strainMid).toBeCloseTo(STRAIN_UNEMPLOYED * (1 - 5 / 12), 10)
    expect(strainRich).toBe(0) // runway >= 12 months
  })

  it('stays within [0, 1] for a whole simulated population', () => {
    const sim = Simulation.create(
      { seed: 7, populationTarget: 100, years: 1 },
      { systems: [demographicsSystem, ...economySystems()] }
    )
    sim.run()
    for (const person of sim.ctx.world.persons) {
      if (!person.alive) continue
      const strain = financialStrainOf(person)
      expect(strain).toBeGreaterThanOrEqual(0)
      expect(strain).toBeLessThanOrEqual(1)
    }
  }, 60_000)
})

describe('recordEconomyMetrics', () => {
  it('records employment, income and wealth gauges within valid domains', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 100, years: 2 },
      { systems: [demographicsSystem, ...economySystems()] }
    )
    sim.run()
    recordEconomyMetrics(sim.ctx) // refresh at the final tick

    const metrics = sim.ctx.metrics
    const employmentRate = metrics.gaugeValue('employment_rate')
    expect(employmentRate).toBeGreaterThanOrEqual(0)
    expect(employmentRate).toBeLessThanOrEqual(1)
    expect(metrics.gaugeValue('mean_income')).toBeGreaterThan(0)
    expect(metrics.gaugeValue('mean_wealth')).toBeGreaterThanOrEqual(0)
    const gini = metrics.gaugeValue('wealth_gini')
    expect(gini).toBeGreaterThanOrEqual(0)
    expect(gini).toBeLessThanOrEqual(1)

    const incomeStats = metrics.statsOf('income')
    expect(incomeStats).not.toBeNull()
    expect((incomeStats as { count: number }).count).toBeGreaterThan(0)
    expect((incomeStats as { mean: number }).mean).toBeGreaterThan(0)
  }, 60_000)
})

describe('initialEconomy', () => {
  it('produces an integer, non-negative, unemployed zero-income state', () => {
    const economy = initialEconomy(createRng(1), 40)
    expect(economy.employerId).toBeNull()
    expect(economy.monthlyIncomeCents).toBe(0)
    expect(economy.lastMonthConsumptionCents).toBe(0)
    expect(Number.isInteger(economy.wealthCents)).toBe(true)
    expect(economy.wealthCents).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic under the same rng seed', () => {
    const a = initialEconomy(createRng(123), 33)
    const b = initialEconomy(createRng(123), 33)
    expect(a).toEqual(b)
  })

  it('follows the age curve: older cohorts hold more wealth on average', () => {
    const averageWealth = (age: number) => {
      const rng = createRng(`age-${age}`)
      let total = 0
      for (let i = 0; i < 50; i++) total += initialEconomy(rng, age).wealthCents
      return total / 50
    }
    expect(averageWealth(55)).toBeGreaterThan(averageWealth(25))
  })
})
