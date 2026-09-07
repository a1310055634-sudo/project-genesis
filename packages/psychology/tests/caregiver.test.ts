import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'
import { caregiverLoadOf, dailyPsychologyUpdate, PsychEnvironment } from '@genesis/psychology'
import { cloneCohort, inRange, makeCohort, meanRest, meanStress } from './helpers'

const BASE_ENV: PsychEnvironment = {
  financialStrain: 0.2,
  occupationalStrain: 0.2,
  relationshipConflict: 0.2,
  socialSupport: 0.4,
  adverseEvents: 0.05
}

const DAYS = 90

function runDays(persons: ReturnType<typeof makeCohort>, env: PsychEnvironment, days: number, rngSeed: number | string): void {
  const rng = createRng(rngSeed)
  for (let d = 0; d < days; d++) {
    for (const p of persons) dailyPsychologyUpdate(p, env, rng)
  }
}

describe('caregiver load (GEN-072)', () => {
  it('burdened parents end with higher stress and lower needRest than non-burdened (90 days)', () => {
    const base = makeCohort('caregiver', 60)
    const unburdened = cloneCohort(base)
    const burdened = base // identical personalities, identical rng stream

    runDays(unburdened, { ...BASE_ENV, caregiverLoad: 0 }, DAYS, 'caregiver-rng')
    runDays(burdened, { ...BASE_ENV, caregiverLoad: 1 }, DAYS, 'caregiver-rng')

    expect(meanStress(burdened)).toBeGreaterThan(meanStress(unburdened))
    expect(meanStress(burdened) - meanStress(unburdened)).toBeGreaterThan(0.15)
    expect(meanRest(burdened)).toBeLessThan(meanRest(unburdened))
    expect(meanRest(unburdened) - meanRest(burdened)).toBeGreaterThan(0.2)

    for (const p of [...burdened, ...unburdened]) {
      expect(inRange(p.psychology.stress, 0, 1)).toBe(true)
      expect(inRange(p.psychology.needRest, 0, 1)).toBe(true)
      expect(inRange(p.psychology.wellbeing, 0, 1)).toBe(true)
      expect(inRange(p.psychology.affectValence, -1, 1)).toBe(true)
    }
  })

  it('is backward compatible: undefined caregiverLoad behaves exactly like explicit 0', () => {
    const base = makeCohort('caregiver-compat', 40)
    const implicit = cloneCohort(base)
    const explicitZero = base

    runDays(implicit, BASE_ENV, DAYS, 'compat-rng') // no caregiverLoad key at all
    runDays(explicitZero, { ...BASE_ENV, caregiverLoad: 0 }, DAYS, 'compat-rng')

    expect(implicit.map((p) => p.psychology)).toEqual(explicitZero.map((p) => p.psychology))
  })

  it('stays deterministic under caregiver load (same seed, identical sequences)', () => {
    const a = makeCohort('caregiver-det', 30)
    const b = cloneCohort(a)
    const env: PsychEnvironment = { ...BASE_ENV, caregiverLoad: 1 }
    runDays(a, env, DAYS, 777)
    runDays(b, env, DAYS, 777)
    expect(b.map((p) => p.psychology)).toEqual(a.map((p) => p.psychology))
  })

  it('keeps every value in-domain over 500 days of maximal load', () => {
    const persons = makeCohort('caregiver-extreme', 20)
    const extreme: PsychEnvironment = {
      financialStrain: 1,
      occupationalStrain: 1,
      relationshipConflict: 1,
      socialSupport: 0,
      adverseEvents: 1,
      caregiverLoad: 1
    }
    const rng = createRng('caregiver-extreme-rng')
    for (let d = 0; d < 500; d++) {
      for (const p of persons) dailyPsychologyUpdate(p, extreme, rng)
    }
    for (const p of persons) {
      expect(inRange(p.psychology.stress, 0, 1)).toBe(true)
      expect(inRange(p.psychology.needRest, 0, 1)).toBe(true)
      expect(inRange(p.psychology.needSocial, 0, 1)).toBe(true)
      expect(inRange(p.psychology.needEsteem, 0, 1)).toBe(true)
      expect(inRange(p.psychology.affectValence, -1, 1)).toBe(true)
      expect(inRange(p.psychology.affectArousal, 0, 1)).toBe(true)
      expect(inRange(p.psychology.wellbeing, 0, 1)).toBe(true)
    }
  })

  it('caregiverLoadOf: linear below two young children, capped at two', () => {
    expect(caregiverLoadOf(0)).toBe(0)
    expect(caregiverLoadOf(1)).toBe(0.5)
    expect(caregiverLoadOf(2)).toBe(1)
    expect(caregiverLoadOf(7)).toBe(1)
    expect(caregiverLoadOf(-3)).toBe(0)
  })
})
