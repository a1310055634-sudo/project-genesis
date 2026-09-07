import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'

describe('seeded RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('accepts string seeds deterministically', () => {
    expect(Array.from({ length: 10 }, () => createRng('genesis').next())).toEqual(
      Array.from({ length: 10 }, () => createRng('genesis').next())
    )
  })

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, () => createRng(1).next())
    const b = Array.from({ length: 20 }, () => createRng(2).next())
    expect(a).not.toEqual(b)
  })

  it('next() stays in [0,1) across 10k draws', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int() respects bounds', () => {
    const rng = createRng(9)
    for (let i = 0; i < 1_000; i++) {
      const v = rng.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
      expect(Number.isInteger(v)).toBe(true)
    }
    expect(() => rng.int(5, 4)).toThrow()
    expect(() => rng.int(1.5, 3)).toThrow()
  })

  it('int() hits both ends of the range', () => {
    const rng = createRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 6))
    expect(seen.has(1)).toBe(true)
    expect(seen.has(6)).toBe(true)
  })

  it('bool() respects p=0 and p=1', () => {
    const rng = createRng(3)
    for (let i = 0; i < 100; i++) {
      expect(rng.bool(0)).toBe(false)
      expect(rng.bool(1)).toBe(true)
    }
    expect(() => rng.bool(1.5)).toThrow()
  })

  it('pick() never returns undefined for non-empty arrays', () => {
    const rng = createRng(5)
    const items = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items))
    }
    expect(() => rng.pick([])).toThrow()
  })

  it('shuffle() is a permutation and deterministic', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8]
    const b = [1, 2, 3, 4, 5, 6, 7, 8]
    createRng(42).shuffle(a)
    createRng(42).shuffle(b)
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('fork() gives independent deterministic streams', () => {
    const base = createRng(42)
    const f1 = base.fork('psychology')
    const f2 = base.fork('psychology')
    const s1 = Array.from({ length: 50 }, () => f1.next())
    const s2 = Array.from({ length: 50 }, () => f2.next())
    expect(s1).toEqual(s2)
    const f3 = base.fork('economy')
    expect(Array.from({ length: 50 }, () => f3.next())).not.toEqual(s1)
  })

  it('rejects non-finite seeds', () => {
    expect(() => createRng(NaN)).toThrow()
    expect(() => createRng(Infinity)).toThrow()
  })
})
