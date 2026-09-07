import { EntityIdIssuer, EventBus, EventLog, MetricsRegistry, Rng, Scheduler, SimulationClock, ScheduledSystem, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'
import { SimulationConfig } from './config'
import { Employer, Household, Person, WorldState } from './types'

/**
 * Simulation context: the single object every system receives.
 * The clock is authoritative for time; wall-clock access is impossible here.
 */
export interface SimContext {
  readonly config: SimulationConfig
  readonly clock: SimulationClock
  readonly rng: Rng
  readonly events: EventBus
  readonly log: EventLog
  readonly metrics: MetricsRegistry
  readonly scheduler: Scheduler<SimContext>
  readonly ids: EntityIdIssuer
  readonly world: WorldState
  /** System-registered extension slots (e.g. relationship graph instance). */
  readonly extensions: Map<string, unknown>
  tick(): number
}

export function createContext(config: SimulationConfig, world: WorldState, seedRng: Rng): SimContext {
  const clock = new SimulationClock()
  const events = new EventBus()
  const log = new EventLog()
  events.onAny((e) => log.append(e))
  const ctx: SimContext = {
    config,
    clock,
    rng: seedRng,
    events,
    log,
    metrics: new MetricsRegistry(),
    scheduler: new Scheduler<SimContext>(),
    ids: new EntityIdIssuer(),
    world,
    extensions: new Map(),
    tick: () => clock.tick
  }
  return ctx
}

/** Index maps for O(1) lookups; rebuilt from arrays so serialization stays stable. */
export interface WorldIndex {
  personById: Map<string, Person>
  householdById: Map<string, Household>
  employerById: Map<string, Employer>
}

export function buildIndex(world: WorldState): WorldIndex {
  const personById = new Map<string, Person>()
  for (const p of world.persons) {
    if (personById.has(p.id)) throw new Error(`duplicate person id: ${p.id}`)
    personById.set(p.id, p)
  }
  const householdById = new Map<string, Household>()
  for (const h of world.households) {
    if (householdById.has(h.id)) throw new Error(`duplicate household id: ${h.id}`)
    householdById.set(h.id, h)
  }
  const employerById = new Map<string, Employer>()
  for (const e of world.employers) {
    if (employerById.has(e.id)) throw new Error(`duplicate employer id: ${e.id}`)
    employerById.set(e.id, e)
  }
  return { personById, householdById, employerById }
}

/** A scheduled simulation system over the full SimContext. */
export interface GenesisSystem extends ScheduledSystem<SimContext> {}

/** Month-boundary helper for monthly systems. */
export function nextMonthStart(ctx: SimContext): number {
  const tick = ctx.tick()
  return (Math.floor(tick / TICKS_PER_MONTH) + 1) * TICKS_PER_MONTH
}

/** Year-boundary helper for yearly systems. */
export function nextYearStart(ctx: SimContext): number {
  const tick = ctx.tick()
  return (Math.floor(tick / TICKS_PER_YEAR) + 1) * TICKS_PER_YEAR
}

/** Day-boundary helper for daily systems. */
export function nextDayStart(ctx: SimContext): number {
  const tick = ctx.tick()
  return (Math.floor(tick / 24) + 1) * 24
}
