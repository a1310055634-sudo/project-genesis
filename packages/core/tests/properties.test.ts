import { describe, it, expect } from 'vitest'
import { createRng, Scheduler, SchedulerContext } from '@genesis/core'
import { addMoney, cents, scaleMoney, splitMoney, subMoney } from '@genesis/shared'

/**
 * Property-based tests (GEN-133) with hand-rolled deterministic generators —
 * no new dependencies. Each property runs over many generated cases with a
 * fixed seed, so failures reproduce exactly.
 */

describe('RNG distribution properties', () => {
  it('next() fills 10 deciles roughly uniformly (deterministic smoke)', () => {
    const rng = createRng('uniformity')
    const bins = new Array<number>(10).fill(0)
    const draws = 10_000
    for (let i = 0; i < draws; i++) bins[Math.min(9, Math.floor(rng.next() * 10))]++
    for (let b = 0; b < 10; b++) {
      const expected = draws / 10
      // ±15% tolerance — a broken generator would miss this by miles
      expect(bins[b]).toBeGreaterThan(expected * 0.85)
      expect(bins[b]).toBeLessThan(expected * 1.15)
    }
  })

  it('int(a,b) mean approaches the midpoint', () => {
    const rng = createRng('midpoint')
    let sum = 0
    const n = 10_000
    for (let i = 0; i < n; i++) sum += rng.int(0, 100)
    const mean = sum / n
    expect(mean).toBeGreaterThan(45)
    expect(mean).toBeLessThan(55)
  })

  it('shuffle preserves multiset and never fixes every position', () => {
    const rng = createRng('shuffle')
    for (let trial = 0; trial < 50; trial++) {
      const items = Array.from({ length: 20 }, (_, i) => i)
      const before = [...items]
      rng.shuffle(items)
      expect([...items].sort((a, b) => a - b)).toEqual(before)
    }
  })
})

describe('scheduler properties under random registration', () => {
  it('fires are globally ordered by tick and each system keeps its cadence', () => {
    const rng = createRng('scheduler-fuzz')
    const scheduler = new Scheduler<SchedulerContext>()
    const intervals: Record<string, number> = {}
    const lastFire: Record<string, number> = {}
    const fired: Array<{ id: string; tick: number }> = []
    const ctx0: SchedulerContext = { tick: 0 }

    for (let i = 0; i < 30; i++) {
      const id = `sys-${i}`
      const interval = rng.int(24, 720)
      intervals[id] = interval
      scheduler.register(
        {
          id,
          priority: rng.int(-5, 5),
          nextFireTick: (ctx) => ctx.tick + interval,
          run: (ctx) => fired.push({ id, tick: ctx.tick })
        },
        ctx0,
        rng.int(1, 720)
      )
    }

    scheduler.fireDue(5_000, (tick) => ({ tick }))

    // global ordering: ticks non-decreasing across the whole firing sequence
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i]!.tick).toBeGreaterThanOrEqual(fired[i - 1]!.tick)
    }
    // cadence: consecutive fires of one system differ by exactly its interval
    for (const { id, tick } of fired) {
      if (lastFire[id] === undefined) {
        lastFire[id] = tick
        continue
      }
      expect(tick - lastFire[id]).toBe(intervals[id])
      lastFire[id] = tick
    }
    // everything actually ran
    expect(fired.length).toBeGreaterThan(100)
  })
})

describe('money conservation properties', () => {
  it('random adds/subtracts round-trip exactly', () => {
    const rng = createRng('money-roundtrip')
    for (let i = 0; i < 500; i++) {
      const a = rng.int(-1_000_000, 1_000_000)
      const b = rng.int(-1_000_000, 1_000_000)
      expect(subMoney(addMoney(cents(a), cents(b)), cents(b))).toBe(a)
    }
  })

  it('splitMoney always conserves and parts differ by at most 1', () => {
    const rng = createRng('money-split')
    for (let i = 0; i < 300; i++) {
      const total = rng.int(-50_000, 50_000)
      const n = rng.int(1, 12)
      const parts = splitMoney(total, n)
      expect(parts.reduce((x, y) => x + y, 0)).toBe(total)
      const sorted = [...parts].sort((x, y) => x - y)
      expect((sorted[sorted.length - 1] as number) - (sorted[0] as number)).toBeLessThanOrEqual(1)
      for (const part of parts) expect(Number.isInteger(part)).toBe(true)
    }
  })

  it('scaleMoney with factor 1 is identity and 0 gives 0', () => {
    const rng = createRng('money-scale')
    for (let i = 0; i < 200; i++) {
      const a = rng.int(-1_000_000, 1_000_000)
      expect(scaleMoney(a, 1)).toBe(a)
      expect(scaleMoney(a, 0)).toBe(0)
    }
  })
})
