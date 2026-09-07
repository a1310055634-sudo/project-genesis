import { GenesisSystem, nextDayStart, Person, SimContext } from '@genesis/simulation'
import { TICKS_PER_MONTH } from '@genesis/core'
import { dailyPsychologyUpdate, PsychEnvironment } from './update'

/**
 * Daily psychology system. Fires at every day boundary
 * (nextFireTick = (floor(tick/24)+1)*24, same as nextDayStart) and runs
 * dailyPsychologyUpdate for every alive person in world.persons array order
 * (creation order — naturally deterministic; no sorting needed).
 *
 * Randomness: each person-day draws from an independent fork labeled with
 * (tick, person id), so streams are stable regardless of population
 * composition or iteration changes — replay-safe.
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
      for (const person of ctx.world.persons) {
        if (!person.alive) continue
        const rng = ctx.rng.fork(`psychology:${tick}:${person.id}`)
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
