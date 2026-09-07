import { describe, it, expect } from 'vitest'
import { Scheduler, SchedulerContext } from '@genesis/core'

function ctxOf(tick: number): SchedulerContext {
  return { tick }
}

describe('scheduler', () => {
  it('fires systems in tick order and enforces forward progress', () => {
    const fired: string[] = []
    const scheduler = new Scheduler()
    const ctx0 = ctxOf(0)
    let monthlyDone = false
    scheduler.register(
      {
        id: 'daily',
        nextFireTick: (ctx) => ctx.tick + 2,
        run: (ctx) => fired.push(`daily@${ctx.tick}`)
      },
      ctx0,
      2
    )
    scheduler.register(
      {
        id: 'monthly',
        nextFireTick: () => (monthlyDone ? 100 : 5),
        run: (ctx) => {
          fired.push(`monthly@${ctx.tick}`)
          monthlyDone = true
        }
      },
      ctx0,
      5
    )
    scheduler.fireDue(11, ctxOf)
    expect(fired).toEqual(['daily@2', 'daily@4', 'monthly@5', 'daily@6', 'daily@8', 'daily@10'])
  })

  it('breaks same-tick ties by priority then registration order', () => {
    const fired: string[] = []
    const scheduler = new Scheduler()
    const ctx0 = ctxOf(0)
    const mk = (id: string, priority?: number) => ({
      id,
      priority,
      nextFireTick: (ctx: SchedulerContext) => ctx.tick + 3,
      run: (ctx: SchedulerContext) => fired.push(`${id}@${ctx.tick}`)
    })
    scheduler.register(mk('b-normal'), ctx0, 3)
    scheduler.register(mk('a-high', -1), ctx0, 3)
    scheduler.register(mk('c-normal2'), ctx0, 3)
    scheduler.fireDue(6, ctxOf)
    expect(fired).toEqual(['a-high@3', 'b-normal@3', 'c-normal2@3'])
  })

  it('rejects systems that do not advance time', () => {
    const scheduler = new Scheduler()
    scheduler.register(
      {
        id: 'stuck',
        nextFireTick: (ctx) => ctx.tick,
        run: () => undefined
      },
      ctxOf(0),
      1
    )
    expect(() => scheduler.fireDue(10, ctxOf)).toThrow(/advance time/)
  })

  it('leaves future entries pending and reports the next tick', () => {
    const scheduler = new Scheduler()
    const ctx0 = ctxOf(0)
    scheduler.register({ id: 's', nextFireTick: () => 100, run: () => undefined }, ctx0, 100)
    scheduler.fireDue(50, ctxOf)
    expect(scheduler.pending()).toBe(1)
    expect(scheduler.peekNextTick()).toBe(100)
  })
})
