import { describe, it, expect } from 'vitest'
import { SimulationClock, tickToDate, ageYears, TICKS_PER_DAY, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'

describe('simulation clock', () => {
  it('has the canonical tick constants', () => {
    expect(TICKS_PER_DAY).toBe(24)
    expect(TICKS_PER_MONTH).toBe(720)
    expect(TICKS_PER_YEAR).toBe(8640)
  })

  it('advances forward and refuses to go backward (invariant §27)', () => {
    const clock = new SimulationClock()
    clock.advance(10)
    expect(clock.tick).toBe(10)
    expect(() => clock.setTick(5)).toThrow()
    clock.setTick(100)
    expect(clock.tick).toBe(100)
    expect(() => clock.advance(-1)).toThrow()
  })

  it('derives calendar dates', () => {
    expect(tickToDate(0)).toEqual({ year: 0, month: 1, day: 1, hour: 0 })
    expect(tickToDate(5)).toEqual({ year: 0, month: 1, day: 1, hour: 5 })
    expect(tickToDate(TICKS_PER_DAY)).toEqual({ year: 0, month: 1, day: 2, hour: 0 })
    expect(tickToDate(TICKS_PER_MONTH)).toEqual({ year: 0, month: 2, day: 1, hour: 0 })
    expect(tickToDate(TICKS_PER_YEAR)).toEqual({ year: 1, month: 1, day: 1, hour: 0 })
    const clock = new SimulationClock()
    clock.setTick(TICKS_PER_YEAR + 2 * TICKS_PER_MONTH + 3 * TICKS_PER_DAY + 4)
    expect(clock.date()).toEqual({ year: 1, month: 3, day: 4, hour: 4 })
  })

  it('flags day/month/year boundaries', () => {
    const clock = new SimulationClock()
    clock.setTick(TICKS_PER_DAY)
    expect(clock.isStartOfDay()).toBe(true)
    clock.setTick(TICKS_PER_MONTH)
    expect(clock.isStartOfMonth()).toBe(true)
    clock.setTick(TICKS_PER_YEAR)
    expect(clock.isStartOfYear()).toBe(true)
    clock.setTick(TICKS_PER_YEAR + 1)
    expect(clock.isStartOfYear()).toBe(false)
  })

  it('computes ages from birth ticks', () => {
    expect(ageYears(0, TICKS_PER_YEAR * 40 - 1)).toBe(39)
    expect(ageYears(0, TICKS_PER_YEAR * 40)).toBe(40)
    expect(() => tickToDate(-1)).toThrow()
  })
})
