import { describe, it, expect } from 'vitest'
import { EntityIdIssuer, MetricsRegistry } from '@genesis/core'

describe('entity ids', () => {
  it('issues sequential zero-padded ids deterministically', () => {
    const ids = new EntityIdIssuer()
    expect(ids.next('person')).toBe('person-000001')
    expect(ids.next('person')).toBe('person-000002')
    expect(ids.next('household')).toBe('household-000001')
    expect(ids.issued('person')).toBe(2)
  })

  it('fingerprints its state stably', () => {
    const a = new EntityIdIssuer()
    const b = new EntityIdIssuer()
    a.next('p')
    a.next('p')
    b.next('p')
    b.next('p')
    expect(a.fingerprint()).toBe(b.fingerprint())
  })
})

describe('metrics registry', () => {
  it('tracks counters, gauges and stats with sorted snapshots', () => {
    const m = new MetricsRegistry()
    m.increment('births', 3)
    m.increment('births')
    m.gauge('employment_rate', 0.6123456789)
    for (const v of [1, 2, 3]) m.record('stress', v)
    const snap = m.snapshot()
    expect(snap['births']).toBe(4)
    expect(snap['employment_rate']).toBe(0.612346)
    expect(snap['stress.count']).toBe(3)
    expect(snap['stress.mean']).toBe(2)
    expect(snap['stress.min']).toBe(1)
    expect(snap['stress.max']).toBe(3)
    const keys = Object.keys(snap)
    expect(keys).toEqual([...keys].sort())
  })

  it('rejects non-finite values', () => {
    const m = new MetricsRegistry()
    expect(() => m.gauge('x', NaN)).toThrow()
    expect(() => m.record('x', Infinity)).toThrow()
  })

  it('statsOf returns null for unknown metrics', () => {
    const m = new MetricsRegistry()
    expect(m.statsOf('nope')).toBeNull()
    expect(m.counterValue('nope')).toBe(0)
  })
})
