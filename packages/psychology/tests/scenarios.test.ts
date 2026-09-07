import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'
import { dailyPsychologyUpdate, PsychEnvironment } from '@genesis/psychology'
import { cloneCohort, makeCohort, meanStress } from './helpers'

const DAYS_PER_MONTH = 30
const MONTHS = 12

const BASE_ENV: PsychEnvironment = {
  financialStrain: 0.2,
  occupationalStrain: 0.2,
  relationshipConflict: 0.2,
  socialSupport: 0.4,
  adverseEvents: 0.05
}

/** Advance a cohort `days` days under a fixed env, one shared rng stream in array order. */
function runDays(persons: ReturnType<typeof makeCohort>, env: PsychEnvironment, days: number, rngSeed: number | string): void {
  const rng = createRng(rngSeed)
  for (let d = 0; d < days; d++) {
    for (const p of persons) dailyPsychologyUpdate(p, env, rng)
  }
}

describe('validity scenarios (guide HT-14, aggregate level)', () => {
  it('monotonic: higher financial strain never lowers mean stress', () => {
    const base = makeCohort('monotonic', 200)
    const low = cloneCohort(base)
    const high = base // reuse to avoid a third cohort; identical personalities
    const lowEnv: PsychEnvironment = { ...BASE_ENV, financialStrain: 0.1 }
    const highEnv: PsychEnvironment = { ...BASE_ENV, financialStrain: 0.9 }

    runDays(low, lowEnv, MONTHS * DAYS_PER_MONTH, 'scenario-rng')
    runDays(high, highEnv, MONTHS * DAYS_PER_MONTH, 'scenario-rng')

    const meanLow = meanStress(low)
    const meanHigh = meanStress(high)
    // requirement: mean(high) must not be below mean(low)
    expect(meanHigh).toBeGreaterThanOrEqual(meanLow)
    // and the aggregate effect direction must be clear
    expect(meanHigh - meanLow).toBeGreaterThan(0.3)
  })

  it('moderator: social support buffers the same strain', () => {
    const base = makeCohort('moderator', 200)
    const unsupported = cloneCohort(base)
    const supported = base
    const lowSupportEnv: PsychEnvironment = { ...BASE_ENV, financialStrain: 0.8, socialSupport: 0.1 }
    const highSupportEnv: PsychEnvironment = { ...BASE_ENV, financialStrain: 0.8, socialSupport: 0.8 }

    runDays(unsupported, lowSupportEnv, MONTHS * DAYS_PER_MONTH, 'scenario-rng')
    runDays(supported, highSupportEnv, MONTHS * DAYS_PER_MONTH, 'scenario-rng')

    expect(meanStress(supported)).toBeLessThan(meanStress(unsupported))
  })

  it('recovery: mean stress falls after the stressor is removed', () => {
    const persons = makeCohort('recovery', 200)
    const pressEnv: PsychEnvironment = { ...BASE_ENV, financialStrain: 0.9, occupationalStrain: 0.8, adverseEvents: 0.4 }
    const calmEnv: PsychEnvironment = { financialStrain: 0.02, occupationalStrain: 0.02, relationshipConflict: 0.02, socialSupport: 0.6, adverseEvents: 0 }

    runDays(persons, pressEnv, MONTHS * DAYS_PER_MONTH, 'scenario-rng')
    const stressed = meanStress(persons)
    expect(stressed).toBeGreaterThan(0.7) // the press actually landed

    runDays(persons, calmEnv, 3 * DAYS_PER_MONTH, 'scenario-rng')
    const afterQuarter = meanStress(persons)
    runDays(persons, calmEnv, 9 * DAYS_PER_MONTH, 'scenario-rng')
    const afterYear = meanStress(persons)

    expect(afterQuarter).toBeLessThan(stressed)
    expect(afterYear).toBeLessThan(afterQuarter)
  })
})
