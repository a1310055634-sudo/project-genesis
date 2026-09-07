import { describe, it, expect } from 'vitest'
import { stableStringify, fnv1a, digest } from '@genesis/shared'

describe('stable serialization', () => {
  it('sorts object keys regardless of insertion order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('preserves array order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]')
  })

  it('rejects non-finite numbers (they break determinism)', () => {
    expect(() => stableStringify({ x: NaN })).toThrow()
    expect(() => stableStringify({ x: Infinity })).toThrow()
  })

  it('handles nesting', () => {
    expect(stableStringify({ a: { c: [1, { b: 2 }] }, z: null })).toBe('{"a":{"c":[1,{"b":2}]},"z":null}')
  })

  it('fnv1a is deterministic and differs for different inputs', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
    expect(fnv1a('')).toBe(0x811c9dc5)
  })

  it('digest is stable hex', () => {
    expect(digest({ seed: 42, years: 10 })).toBe(digest({ years: 10, seed: 42 }))
    expect(digest({ a: 1 })).toMatch(/^[0-9a-f]{8}$/)
  })
})
