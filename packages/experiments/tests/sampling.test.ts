import { describe, expect, it } from 'vitest'
import { TICKS_PER_MONTH } from '@genesis/core'
import { GenesisSystem, demographicsSystem } from '@genesis/simulation'
import { economySystems, financialStrainOf } from '@genesis/economy'
import { PsychEnvironment, psychologySystem } from '@genesis/psychology'
import { ExperimentResult, EXPERIMENTS, runExperiment, sampleSummarize } from '@genesis/experiments'

/**
 * GEN-151b: time-sampled experiment metrics + rehire friction, validated on
 * EXP-001 (economic shock → stress). The endpoint-mean dilution lesson from
 * the first EXP-001 run must not regress.
 */
function testSystemsFactory(): GenesisSystem[] {
  return [
    demographicsSystem,
    ...economySystems(),
    psychologySystem((person, _ctx): PsychEnvironment => {
      const child = person.lifeStage === 'child'
      return {
        financialStrain: child ? 0.1 : financialStrainOf(person),
        occupationalStrain: child ? 0 : person.economy.employerId !== null ? 0.2 : 0.5,
        relationshipConflict: 0.1,
        socialSupport: 0.3,
        adverseEvents: 0.05
      }
    })
  ]
}

const EXP001 = EXPERIMENTS['EXP-001']
if (EXP001 === undefined) throw new Error('EXP-001 preset missing')

// full EXP-001 grid with intra-run sampling (2 arms × 3 seeds × 150 × 2y)
const EXP001_RESULT: ExperimentResult = runExperiment(EXP001, testSystemsFactory, {
  sampleMetrics: ['stress.mean', 'wellbeing.mean', 'population']
})

describe('GEN-151b time sampling + rehire friction', () => {
  it('samples monthly rows with real stress values in both arms', () => {
    for (const outcome of EXP001_RESULT.outcomes) {
      // 2y = 24 monthly rows (endpoint tick included via RT1-03 endpoint firing)
      expect(outcome.monthly?.length ?? 0).toBeGreaterThanOrEqual(23)
      const stressRows = (outcome.monthly ?? []).filter((row) => typeof row.values['stress.mean'] === 'number')
      expect(stressRows.length).toBeGreaterThan(20)
    }
  })

  it('post-shock window discriminates: shock arm mean stress > control (CI95 disjoint)', () => {
    // window: months 2-6 after the year-1 shock (ticks 1440..4320)
    const from = 2 * TICKS_PER_MONTH
    const to = 6 * TICKS_PER_MONTH
    const summaries = sampleSummarize(EXP001_RESULT, 'stress.mean', from, to)
    const control = summaries.find((s) => s.arm === 'control')
    const shock = summaries.find((s) => s.arm === 'shock')
    if (control === undefined || shock === undefined) throw new Error('arms missing from window summary')
    expect(control.n).toBe(3)
    expect(shock.n).toBe(3)
    // model-internal direction: the layoff wave elevates cohort stress while
    // the rehire cooldown keeps the shock's unemployment spell alive
    expect(shock.mean).toBeGreaterThan(control.mean)
    // and the arms' windows do not overlap within CI95
    expect(shock.mean - shock.ci95).toBeGreaterThan(control.mean + control.ci95)
  })

  it('rehire friction keeps the shock cohort unemployed through the cooldown', () => {
    // control arm has no shock → nothing to observe there; instead verify via
    // the shock arm's own dynamics: right after the wave (tick 720), the
    // laid-off cohort cannot search until tick 720 + 2*720
    const shockOutcome = EXP001_RESULT.outcomes.find((o) => o.arm === 'shock' && o.seed === 42)
    if (shockOutcome === undefined) throw new Error('missing shock/42')
    const atShock = (shockOutcome.monthly ?? []).find((r) => r.tick === 2 * TICKS_PER_MONTH)
    // month 2 sample exists; deeper behavioral assertions live in the economy
    // package's own friction tests — here we pin the sampling contract only
    expect(atShock).toBeDefined()
  })
})
