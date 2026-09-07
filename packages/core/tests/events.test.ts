import { describe, it, expect } from 'vitest'
import { EventBus, EventLog, SimulationEvent } from '@genesis/core'

function evt(partial: Partial<SimulationEvent>): SimulationEvent {
  return { id: 'e1', type: 'test.event', tick: 0, actorIds: [], ...partial }
}

describe('event bus', () => {
  it('dispatches to typed and catch-all handlers in order', () => {
    const bus = new EventBus()
    const seen: string[] = []
    bus.on('test.event', () => seen.push('typed'))
    bus.onAny(() => seen.push('any'))
    bus.on('other.event', () => seen.push('other'))
    bus.emit(evt({ type: 'test.event' }))
    expect(seen).toEqual(['typed', 'any'])
  })

  it('supports unsubscribe', () => {
    const bus = new EventBus()
    let n = 0
    const off = bus.on('x', () => n++)
    bus.emit(evt({ type: 'x' }))
    off()
    bus.emit(evt({ type: 'x' }))
    expect(n).toBe(1)
  })

  it('validates tick and id', () => {
    const bus = new EventBus()
    expect(() => bus.emit(evt({ tick: -1 }))).toThrow()
    expect(() => bus.emit(evt({ tick: 1.5 }))).toThrow()
    expect(() => bus.emit(evt({ id: '' }))).toThrow()
  })
})

describe('event log', () => {
  it('counts per type and keeps bounded recent window', () => {
    const log = new EventLog(3)
    for (let i = 0; i < 10; i++) {
      log.append(evt({ id: `e${i}`, type: i % 2 === 0 ? 'a' : 'b', tick: i }))
    }
    expect(log.count).toBe(10)
    expect(log.countOf('a')).toBe(5)
    expect(log.countOf('b')).toBe(5)
    expect(log.countOf('c')).toBe(0)
    expect(log.recentEvents().length).toBe(3)
    expect(log.recentEvents()[0]?.id).toBe('e7')
    const stats = log.stats()
    expect(stats.totalEvents).toBe(10)
    expect(stats.byType).toEqual({ a: 5, b: 5 })
    expect(stats.firstTick).toBe(0)
    expect(stats.lastTick).toBe(9)
  })

  it('asserts tick monotonicity', () => {
    const log = new EventLog()
    log.append(evt({ tick: 100 }))
    expect(() => log.assertMonotonic(50)).toThrow()
    expect(() => log.assertMonotonic(100)).not.toThrow()
  })
})
