import { describe, expect, it } from 'vitest'
import { demographicsSystem, GenesisSystem } from '@genesis/simulation'
import { economySystems, financialStrainOf } from '@genesis/economy'
import { psychologySystem } from '@genesis/psychology'
import { ExperimentResult } from '../src/runner'
import {
  FactorialSpec,
  generateArms,
  interactions,
  mainEffects,
  runFactorial
} from '../src/factorial'
import type { ExperimentArm } from '../src/config'

/** Factorial core (Roadmap C1): grid generation, main effects and the
 * difference-in-differences interaction — asserted on hand-computed cells. */

// minimal wiring producing a real stress.mean (mirrors runner.test.ts)
function stressFactory(): GenesisSystem[] {
  return [
    demographicsSystem,
    ...economySystems(),
    psychologySystem((person) => ({
      financialStrain: person.lifeStage === 'child' ? 0.1 : financialStrainOf(person),
      occupationalStrain: person.lifeStage === 'child' || person.economy.employerId === null ? (person.lifeStage === 'child' ? 0 : 0.5) : 0.2,
      relationshipConflict: 0.1,
      socialSupport: 0.3,
      adverseEvents: 0.05
    }))
  ]
}

const spec: FactorialSpec = {
  id: 'T',
  question: 'test',
  seeds: [1],
  population: 10,
  years: 1,
  metric: 'm',
  factors: { A: [0, 1], B: [0, 1] }
}

function syntheticResult(cellValues: Record<string, number>): ExperimentResult {
  const { arms } = generateArms(spec)
  return {
    config: { ...spec, arms: arms as ExperimentArm[] },
    outcomes: arms.map((arm) => ({
      arm: arm.name,
      seed: 1,
      alive: 9,
      population: 10,
      digest: 'd',
      runtimeMs: 0,
      metrics: { m: cellValues[arm.name] }
    }))
  }
}

describe('factorial experiments (C1)', () => {
  it('generateArms: cartesian product, baseline-first, reserved names rejected', () => {
    const { arms, levelsByArm } = generateArms(spec)
    expect(arms.length).toBe(4)
    expect(arms[0].name).toBe('A=0|B=0')
    expect(arms[0].overrides).toEqual({ A: 0, B: 0 })
    expect(levelsByArm.get('A=1|B=1')).toEqual({ A: 1, B: 1 })
    expect(() =>
      generateArms({ ...spec, factors: { seed: [1, 2] } })
    ).toThrow(/reserved/)
    expect(() =>
      generateArms({ ...spec, factors: { empty: [] } })
    ).toThrow(/at least one level/)
  })

  it('main effects and interaction match hand-computed difference-in-differences', () => {
    // cells:  A0B0=10  A1B0=14  A0B1=18  A1B1=26
    const result = syntheticResult({ 'A=0|B=0': 10, 'A=1|B=0': 14, 'A=0|B=1': 18, 'A=1|B=1': 26 })
    const { grandMean, factors } = mainEffects(spec, result, generateArms(spec).levelsByArm)
    expect(grandMean).toBe(17)
    const fa = factors.find((f) => f.factor === 'A')!
    const fb = factors.find((f) => f.factor === 'B')!
    expect(fa.levels).toEqual([
      { level: 0, mean: 14, effect: -3 },
      { level: 1, mean: 20, effect: 3 }
    ])
    expect(fb.levels).toEqual([
      { level: 0, mean: 12, effect: -5 },
      { level: 1, mean: 22, effect: 5 }
    ])
    const ix = interactions(spec, result, generateArms(spec).levelsByArm)
    expect(ix).toEqual([{ factorA: 'A', factorB: 'B', value: 4 }])
  })

  it('runFactorial end-to-end produces the report with all sections', () => {
    const spec3: FactorialSpec = {
      ...spec,
      id: 'T3',
      years: 1,
      population: 60,
      metric: 'stress.mean',
      factors: { A: [0, 1], B: [0, 1], C: [0, 2] }
    }
    const out = runFactorial(spec3, stressFactory)
    expect(out.result.outcomes.length).toBe(8)
    expect(out.grandMean).toBeGreaterThan(0)
    expect(out.report).toContain('# Factorial T3')
    expect(out.report).toContain('## Cell means')
    expect(out.report).toContain('## Main effects')
    expect(out.report).toContain('## Pairwise interactions')
    expect(out.report).toContain('A × B')
  })
})
