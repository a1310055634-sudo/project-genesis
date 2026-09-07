/**
 * Event-driven scheduler (guide §4.5 constraint 4 / ARCHITECTURE.md).
 *
 * Systems register with their next fire tick; the engine pops ticks in
 * ascending order. Persons stay passive — systems batch-process them at their
 * scheduled frequency. Deterministic: ties break by (priority, sequence).
 * Generic over the context type C (simulation passes its full SimContext).
 */
export interface SchedulerContext {
  tick: number
}

export interface ScheduledSystem<C = SchedulerContext> {
  readonly id: string
  /** Lower runs first on equal ticks (0 = default). */
  readonly priority?: number
  /** Register the next tick this system wants to run at. */
  nextFireTick(ctx: C): number
  run(ctx: C): void
}

interface HeapEntry<C> {
  tick: number
  priority: number
  seq: number
  system: ScheduledSystem<C>
}

/** Binary min-heap ordered by (tick, priority, seq). */
class MinHeap<C> {
  private items: Array<HeapEntry<C>> = []

  get size(): number {
    return this.items.length
  }

  push(entry: HeapEntry<C>): void {
    this.items.push(entry)
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.less(i, parent)) {
        this.swap(i, parent)
        i = parent
      } else break
    }
  }

  pop(): HeapEntry<C> | undefined {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let smallest = i
        if (l < this.items.length && this.less(l, smallest)) smallest = l
        if (r < this.items.length && this.less(r, smallest)) smallest = r
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a] as HeapEntry<C>
    const y = this.items[b] as HeapEntry<C>
    if (x.tick !== y.tick) return x.tick < y.tick
    if (x.priority !== y.priority) return x.priority < y.priority
    return x.seq < y.seq
  }

  private swap(a: number, b: number): void {
    const tmp = this.items[a] as HeapEntry<C>
    this.items[a] = this.items[b] as HeapEntry<C>
    this.items[b] = tmp
  }
}

export class Scheduler<C = SchedulerContext> {
  private heap = new MinHeap<C>()
  private seq = 0

  register(system: ScheduledSystem<C>, ctx: C, startTick?: number): void {
    const fire = startTick ?? system.nextFireTick(ctx)
    if (!Number.isInteger(fire) || fire < 0) {
      throw new Error(`system ${system.id} registered invalid tick ${fire}`)
    }
    this.heap.push({ tick: fire, priority: system.priority ?? 0, seq: this.seq++, system })
  }

  /** Fire every system whose next tick is < untilTick, re-registering each after it runs. */
  fireDue(untilTick: number, ctx: (tick: number) => C, onFire?: (systemId: string, tick: number) => void): void {
    for (;;) {
      const top = this.heap.pop()
      if (top === undefined || top.tick >= untilTick) {
        if (top !== undefined) this.heap.push(top)
        return
      }
      const context = ctx(top.tick)
      top.system.run(context)
      if (onFire) onFire(top.system.id, top.tick)
      const next = top.system.nextFireTick(context)
      if (!Number.isInteger(next) || next <= top.tick) {
        throw new Error(`system ${top.system.id} must advance time: nextFireTick=${next} after tick=${top.tick}`)
      }
      this.heap.push({ tick: next, priority: top.priority, seq: this.seq++, system: top.system })
    }
  }

  /** Next tick at which any system wants to run (null when idle). */
  peekNextTick(): number | null {
    const top = this.heap.pop()
    if (top === undefined) return null
    this.heap.push(top)
    return top.tick
  }

  pending(): number {
    return this.heap.size
  }
}
