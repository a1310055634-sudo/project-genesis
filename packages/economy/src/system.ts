import { GenesisSystem, nextDayStart, nextMonthStart, nextYearStart, SimContext } from '@genesis/simulation'
import { dailyConsumption, monthlyJobMarket, monthlyPayroll } from './flows'
import { recordEconomyMetrics } from './indicators'

/**
 * Economy systems (GEN-026/027). Frequencies and boundaries match the
 * demography package: day = every 24 ticks, month = (floor(t/720)+1)*720,
 * year = (floor(t/8640)+1)*8640.
 *
 * Same-tick ordering (lower priority runs first):
 *   consumption(20) → payroll(21) → job-market(22) → metrics(30), so a month
 *   starts with the day's spending, then wages are paid, then the labor market
 *   reassigns jobs. Metrics always observe the post-flow state.
 */

export const consumptionSystem: GenesisSystem = {
  id: 'economy.consumption',
  priority: 20,
  nextFireTick: nextDayStart,
  run(ctx: SimContext) {
    dailyConsumption(ctx)
  }
}

export const payrollSystem: GenesisSystem = {
  id: 'economy.payroll',
  priority: 21,
  nextFireTick: nextMonthStart,
  run(ctx: SimContext) {
    monthlyPayroll(ctx)
  }
}

export const jobMarketSystem: GenesisSystem = {
  id: 'economy.job-market',
  priority: 22,
  nextFireTick: nextMonthStart,
  run(ctx: SimContext) {
    monthlyJobMarket(ctx)
  }
}

export const economyMetricsSystem: GenesisSystem = {
  id: 'economy.metrics',
  priority: 30,
  nextFireTick: nextYearStart,
  run(ctx: SimContext) {
    recordEconomyMetrics(ctx)
  }
}

/** The full economy system set, in a fixed order. */
export function economySystems(): GenesisSystem[] {
  return [consumptionSystem, payrollSystem, jobMarketSystem, economyMetricsSystem]
}
