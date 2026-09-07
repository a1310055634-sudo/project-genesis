import { ageYears } from '@genesis/core'
import { GenesisSystem, nextMonthStart, SimContext } from '@genesis/simulation'
import { educationMetrics, monthlyProgress, schoolAgeAssignments } from './school'

/**
 * Monthly education system (HT-12). Fires on month boundaries
 * (nextMonthStart = (floor(tick / 720) + 1) * 720), priority 14 — after the
 * family system (12) and before the social system (15) on shared ticks; after
 * demographics (10), so aging/deaths/births of the current month are already
 * registered.
 *
 * Fixed phase order inside a monthly run (order matters):
 *   1. schoolAgeAssignments — deterministic enrollment / stage promotion;
 *   2. monthlyProgress      — graduation/dropout rolls + monthly skill update;
 *   3. educationMetrics     — gauges observe the post-progress state.
 */
export function educationSystem(): GenesisSystem {
  return {
    id: 'education',
    priority: 14,
    nextFireTick: nextMonthStart,
    run(ctx: SimContext) {
      schoolAgeAssignments(ctx)
      monthlyProgress(ctx)
      educationMetrics(ctx)
      ctx.metrics.increment('education.months_processed')
    }
  }
}
