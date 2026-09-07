import { TICKS_PER_DAY } from '@genesis/core'
import { GenesisSystem, SimContext } from '@genesis/simulation'
import { RelationshipGraph } from './graph'
import { TICKS_PER_WEEK, weeklySocialUpdate } from './formation'
import { recordGraphMetrics } from './metrics'

/** Graph metrics are refreshed every 4 weeks (4 * 168 = 672 ticks). */
const METRICS_INTERVAL_TICKS = TICKS_PER_WEEK * 4

/**
 * Weekly social system. Fires on week boundaries:
 * nextFireTick = (floor(tick / 168) + 1) * 168. Priority 15 → runs after the
 * monthly demographics system (priority 10) on ticks where both fire.
 *
 * Metrics: weekly fire ticks are multiples of 168, so `tick % 672 === 0`
 * selects exactly every fourth run (672, 1344, ...) — graph gauges are
 * recorded there.
 */
export function socialSystem(graph: RelationshipGraph): GenesisSystem {
  return {
    id: 'social',
    priority: 15,
    nextFireTick: (ctx: SimContext) => (Math.floor(ctx.tick() / TICKS_PER_WEEK) + 1) * TICKS_PER_WEEK,
    run(ctx: SimContext) {
      weeklySocialUpdate(ctx, graph)
      if (ctx.tick() % METRICS_INTERVAL_TICKS === 0) recordGraphMetrics(ctx, graph)
    }
  }
}
