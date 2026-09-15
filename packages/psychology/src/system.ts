import { GenesisSystem, nextDayStart, Person, SimContext } from '@genesis/simulation'
import { TICKS_PER_MONTH } from '@genesis/core'
import { dailyPsychologyUpdate, PsychEnvironment } from './update'

/**
 * Daily psychology system. Fires at every day boundary
 * (nextFireTick = (floor(tick/24)+1)*24, same as nextDayStart) and runs
 * dailyPsychologyUpdate for every alive person in world.persons array order
 * (creation order — naturally deterministic; no sorting needed).
 *
 * Randomness: ONE rng stream forked per day (`psychology:${tick}`), consumed
 * sequentially in world.persons array order. Replay stability rests on the
 * same two invariants as before (KI-2b/A2): the persons array is append-only
 * (births land at the end — earlier sequences unaffected) and dead persons
 * are skipped BEFORE any draw (a death consumes nothing). The previous
 * per-person fork (`psychology:${tick}:${person.id}`) cost a full label hash
 * per person per day — ~11% of total CPU at 10k scale (KI2_PROFILE.md).
 *
 * Observability: at each month boundary (tick % TICKS_PER_MONTH === 0) the
 * alive population's stress / wellbeing / affectValence are streamed into
 * MetricsRegistry via record(); the registry exposes running
 * stress.mean / wellbeing.mean / affect.mean in snapshots.
 */
export function psychologySystem(envOf: (person: Person, ctx: SimContext) => PsychEnvironment): GenesisSystem {
  return {
    id: 'psychology',
    priority: 20, // after demographics (10) so aging/deaths land first
    nextFireTick: nextDayStart,
    run(ctx: SimContext) {
      const tick = ctx.tick()
      // KI-2b (A2): one daily fork shared across persons — see the docblock
      // for the replay-stability argument.
      const rng = ctx.rng.fork(`psychology:${tick}`)
      for (const person of ctx.world.persons) {
        if (!person.alive) continue
        dailyPsychologyUpdate(person, envOf(person, ctx), rng)
      }
      if (tick % TICKS_PER_MONTH === 0) {
        for (const person of ctx.world.persons) {
          if (!person.alive) continue
          ctx.metrics.record('stress', person.psychology.stress)
          ctx.metrics.record('wellbeing', person.psychology.wellbeing)
          ctx.metrics.record('affect', person.psychology.affectValence)
        }
      }
      ctx.metrics.increment('psychology.days_processed')
    }
  }
}
