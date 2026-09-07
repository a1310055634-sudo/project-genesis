import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'
import { dailyPsychologyUpdate, PsychEnvironment } from '@genesis/psychology'
import { cloneCohort, makeCohort } from './helpers'

const ENV: PsychEnvironment = {
  financialStrain: 0.4,
  occupationalStrain: 0.5,
  relationshipConflict: 0.3,
  socialSupport: 0.5,
  adverseEvents: 0.1
}

function runCohort(persons: ReturnType<typeof makeCohort>, days: number, seed: number | string): void {
  const rng = createRng(seed)
  for (let d = 0; d < days; d++) {
    for (const p of persons) dailyPsychologyUpdate(p, ENV, rng)
  }
}

describe('dailyPsychologyUpdate determinism', () => {
  it('same seed produces byte-identical sequences', () => {
    const a = makeCohort('det', 100)
    const b = cloneCohort(a)
    runCohort(a, 60, 12345)
    runCohort(b, 60, 12345)
    expect(b.map((p) => p.psychology)).toEqual(a.map((p) => p.psychology))
    expect(b.map((p) => p.personality)).toEqual(a.map((p) => p.personality))
  })

  it('different seeds produce different sequences', () => {
    const a = makeCohort('det2', 50)
    const b = cloneCohort(a)
    runCohort(a, 30, 1)
    runCohort(b, 30, 2)
    expect(b.map((p) => p.psychology)).not.toEqual(a.map((p) => p.psychology))
  })
})
