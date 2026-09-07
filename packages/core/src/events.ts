/**
 * Event system (guide §4.4). Typed, append-friendly, countable, replayable.
 *
 * The EventLog keeps per-type aggregate counters plus a bounded recent window
 * (guide §4.5 constraint 5): raw history never grows unbounded; aggregates do.
 */
export type SimulationEventType =
  | 'person.born'
  | 'person.died'
  | 'person.aged'
  | 'job.started'
  | 'job.ended'
  | 'income.received'
  | 'consumption.paid'
  | 'relationship.started'
  | 'relationship.ended'
  | 'marriage.created'
  | 'household.created'
  | 'stress.changed'
  | 'company.created'
  | 'company.closed'
  | 'education.completed'
  | 'sim.invariant.violation'
  | string // extensible; core names above are canonical

export interface SimulationEvent<T = unknown> {
  id: string
  type: SimulationEventType
  tick: number
  actorIds: string[]
  payload?: T
}

export type EventHandler = (event: SimulationEvent) => void

export class EventBus {
  private handlers = new Map<string, EventHandler[]>()
  private anyHandlers: EventHandler[] = []

  on(type: SimulationEventType, handler: EventHandler): () => void {
    const list = this.handlers.get(type) ?? []
    list.push(handler)
    this.handlers.set(type, list)
    return () => {
      const current = this.handlers.get(type) ?? []
      const idx = current.indexOf(handler)
      if (idx >= 0) current.splice(idx, 1)
    }
  }

  onAny(handler: EventHandler): () => void {
    this.anyHandlers.push(handler)
    return () => {
      const idx = this.anyHandlers.indexOf(handler)
      if (idx >= 0) this.anyHandlers.splice(idx, 1)
    }
  }

  emit(event: SimulationEvent): void {
    if (!Number.isInteger(event.tick) || event.tick < 0) {
      throw new Error(`event tick must be a non-negative integer, got ${event.tick}`)
    }
    if (!event.id) throw new Error('event id is required')
    for (const h of this.handlers.get(event.type) ?? []) h(event)
    for (const h of this.anyHandlers) h(event)
  }
}

export interface EventLogStats {
  totalEvents: number
  byType: Record<string, number>
  firstTick: number | null
  lastTick: number | null
}

export class EventLog {
  private ring: SimulationEvent[]
  private head = 0
  private total = 0
  private counts = new Map<string, number>()
  private firstTick: number | null = null
  private lastTick: number | null = null

  constructor(private readonly recentWindow = 1_000) {
    this.ring = new Array<SimulationEvent>(recentWindow)
  }

  append(event: SimulationEvent): void {
    this.total++
    this.counts.set(event.type, (this.counts.get(event.type) ?? 0) + 1)
    if (this.firstTick === null || event.tick < this.firstTick) this.firstTick = event.tick
    if (this.lastTick === null || event.tick > this.lastTick) this.lastTick = event.tick
    // ring buffer (red team RT1-04): O(1) append, no element shifting on hot path
    this.ring[this.head] = event
    this.head = (this.head + 1) % this.recentWindow
  }

  get count(): number {
    return this.total
  }

  countOf(type: SimulationEventType): number {
    return this.counts.get(type) ?? 0
  }

  /** Most recent events (bounded window), oldest first. */
  recentEvents(): SimulationEvent[] {
    const n = Math.min(this.total, this.recentWindow)
    if (this.total <= this.recentWindow) {
      return this.ring.slice(0, n)
    }
    return this.ring.slice(this.head).concat(this.ring.slice(0, this.head))
  }

  /** Monotonicity check helper (§27: event ticks never go backward). */
  assertMonotonic(tick: number): void {
    if (this.lastTick !== null && tick < this.lastTick) {
      throw new Error(`event tick regression: ${tick} < ${this.lastTick}`)
    }
  }

  stats(): EventLogStats {
    const byType: Record<string, number> = {}
    for (const key of [...this.counts.keys()].sort()) {
      byType[key] = this.counts.get(key) as number
    }
    return { totalEvents: this.total, byType, firstTick: this.firstTick, lastTick: this.lastTick }
  }
}
