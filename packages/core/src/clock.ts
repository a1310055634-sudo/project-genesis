/**
 * Canonical simulation time (guide §4.2, ARCHITECTURE.md).
 *
 * Base tick = 1 simulated hour. Simplified calendar (recorded simplification):
 * 24h days, 30-day months, 12-month years, no weekdays, no leap years.
 * Wall-clock time is FORBIDDEN here — the clock only advances via ticks.
 */
export const TICKS_PER_HOUR = 1
export const HOURS_PER_DAY = 24
export const DAYS_PER_MONTH = 30
export const MONTHS_PER_YEAR = 12
export const TICKS_PER_DAY = HOURS_PER_DAY * TICKS_PER_HOUR // 24
export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH // 720
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR // 8_640

export interface SimDate {
  year: number
  month: number // 1..12
  day: number // 1..30
  hour: number // 0..23
}

export class SimulationClock {
  private currentTick = 0

  get tick(): number {
    return this.currentTick
  }

  /** Advance to an absolute tick; the tick must never move backward (invariant §27). */
  setTick(tick: number): void {
    if (!Number.isInteger(tick) || tick < this.currentTick) {
      throw new Error(`clock tick must be a non-decreasing integer, ${this.currentTick} -> ${tick}`)
    }
    this.currentTick = tick
  }

  advance(delta = 1): void {
    this.setTick(this.currentTick + delta)
  }

  /** Absolute simulated date derived from the tick. */
  date(): SimDate {
    return tickToDate(this.currentTick)
  }

  /** Simulated years elapsed since tick 0 (float, e.g. 2.5). */
  yearsElapsed(): number {
    return this.currentTick / TICKS_PER_YEAR
  }

  isStartOfDay(): boolean {
    return this.currentTick % TICKS_PER_DAY === 0
  }

  isStartOfMonth(): boolean {
    return this.currentTick % TICKS_PER_MONTH === 0
  }

  isStartOfYear(): boolean {
    return this.currentTick % TICKS_PER_YEAR === 0
  }
}

export function tickToDate(tick: number): SimDate {
  if (!Number.isInteger(tick) || tick < 0) throw new Error(`invalid tick: ${tick}`)
  const hour = tick % TICKS_PER_DAY
  const totalDays = Math.floor(tick / TICKS_PER_DAY)
  const day = (totalDays % DAYS_PER_MONTH) + 1
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH)
  const month = (totalMonths % MONTHS_PER_YEAR) + 1
  const year = Math.floor(totalMonths / MONTHS_PER_YEAR)
  return { year, month, day, hour }
}

/** Age in whole years given birth tick and now. */
export function ageYears(birthTick: number, nowTick: number): number {
  return Math.floor((nowTick - birthTick) / TICKS_PER_YEAR)
}
