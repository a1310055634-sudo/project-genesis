import { describe, expect, it } from 'vitest'
import { ci95HalfWidth, mean, stdDev } from '@genesis/experiments'

describe('stats (known values)', () => {
  it('mean of 1..4 is 2.5', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  it('population stdDev of the classic sample [2,4,4,4,5,5,7,9] is exactly 2', () => {
    // mean 5, squared deviations sum 32, /8 = 4, sqrt = 2 (population, n denominator)
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })

  it('stdDev of a single value is 0', () => {
    expect(stdDev([7])).toBe(0)
  })

  it('ci95 half width = 1.96 * sd / sqrt(n)', () => {
    // sd([1,2,3,4]) = sqrt(1.25); ci = 1.96 * sqrt(1.25) / 2
    expect(ci95HalfWidth([1, 2, 3, 4])).toBeCloseTo((1.96 * Math.sqrt(1.25)) / 2, 12)
  })

  it('ci95 is 0 for samples with fewer than 2 values', () => {
    expect(ci95HalfWidth([5])).toBe(0)
    expect(ci95HalfWidth([])).toBe(0)
  })

  it('rejects empty samples for mean/stdDev', () => {
    expect(() => mean([])).toThrow(/empty/)
    expect(() => stdDev([])).toThrow(/empty/)
  })
})
