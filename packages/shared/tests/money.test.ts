import { describe, it, expect } from 'vitest'
import { cents, addMoney, subMoney, scaleMoney, splitMoney, formatMoney, assertMoneyFinite } from '@genesis/shared'

describe('money (integer cents)', () => {
  it('accepts integers only', () => {
    expect(cents(0)).toBe(0)
    expect(cents(-125)).toBe(-125)
    expect(() => cents(1.5)).toThrow()
    expect(() => cents(NaN)).toThrow()
    expect(() => cents(Infinity)).toThrow()
  })

  it('adds and subtracts exactly', () => {
    expect(addMoney(cents(99), cents(1))).toBe(100)
    expect(subMoney(cents(100), cents(250))).toBe(-150)
  })

  it('scales with explicit rounding', () => {
    expect(scaleMoney(105, 0.5, 'nearest')).toBe(53)
    expect(scaleMoney(105, 0.5, 'floor')).toBe(52)
    expect(scaleMoney(105, 0.5, 'ceil')).toBe(53)
    expect(() => scaleMoney(100, NaN)).toThrow()
    expect(() => scaleMoney(100, -1)).toThrow()
  })

  it('splits evenly and conserves the total', () => {
    for (const total of [100, 101, 99, 7, -10]) {
      for (const n of [1, 2, 3, 7]) {
        const parts = splitMoney(total, n)
        const sum = parts.reduce((a, b) => a + b, 0)
        expect(sum).toBe(total)
      }
    }
  })

  it('asserts finiteness with context', () => {
    expect(() => assertMoneyFinite(1.5, 'test')).toThrow(/test/)
    expect(() => assertMoneyFinite(-3, 'test')).not.toThrow()
  })

  it('formats', () => {
    expect(formatMoney(1025)).toBe('$10.25')
    expect(formatMoney(-400)).toBe('-$4.00')
  })
})
