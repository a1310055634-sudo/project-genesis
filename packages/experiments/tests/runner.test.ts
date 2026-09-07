import { describe, expect, it } from 'vitest'
import { GenesisSystem, demographicsSystem } from '@genesis/simulation'
import { economySystems, financialStrainOf } from '@genesis/economy'
import { PsychEnvironment, psychologySystem } from '@genesis/psychology'
import { ExperimentArm, ExperimentConfig, ExperimentResult, EXPERIMENTS, RunOutcome, runExperiment, summarize } from '@genesis/experiments'

/**
 * Test composition root: engine-level stack for the experiments package.
 * NOT the CLI profile (apps/ is out of import scope) — a hand-written,
 * minimal wiring that keeps the pathway EXP-002 probes intact:
 * employmentRate → financialStrainOf (@genesis/economy) → stress (@genesis/psychology).
 * Non-focal environment inputs are constants (recorded simplification).
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

const EXP002 = EXPERIMENTS['EXP-002']
if (EXP002 === undefined) throw new Error('EXP-002 preset missing')

// Full EXP-002 grid (2 arms × 3 seeds × 150 persons × 2y) — computed once, shared by tests.
const EXP002_RESULT: ExperimentResult = runExperiment(EXP002, testSystemsFactory)

function outcomeFor(result: ExperimentResult, arm: string, seed: number): RunOutcome {
  const hit = result.outcomes.find((o) => o.arm === arm && o.seed === seed)
  if (hit === undefined) throw new Error(`missing outcome ${arm}/${seed}`)
  return hit
}

function singleCell(config: ExperimentConfig, arm: ExperimentArm, seed: number): ExperimentConfig {
  return { ...config, seeds: [seed], arms: [arm] }
}

describe('runExperiment (EXP-002 full run: 2 arms × 3 seeds × 150 persons × 2y)', () => {
  it('runs every arm×seed cell with merged metrics and reproducible digests', () => {
    const result = EXP002_RESULT

    // full grid, declaration order
    expect(result.outcomes.length).toBe(EXP002.arms.length * EXP002.seeds.length)
    expect(result.outcomes.map((o) => `${o.arm}:${String(o.seed)}`)).toEqual([
      'control:42',
      'control:43',
      'control:44',
      'treatment:42',
      'treatment:43',
      'treatment:44'
    ])

    for (const o of result.outcomes) {
      expect(o.alive).toBeGreaterThan(0)
      expect(o.population).toBeGreaterThanOrEqual(o.alive)
      expect(o.digest).toMatch(/^[0-9a-f]{8}$/)
      // default: no injected clock ⇒ runtimeMs recorded as 0 (byte-reproducible exports)
      expect(o.runtimeMs).toBe(0)
      const stress = o.metrics['stress.mean']
      expect(typeof stress).toBe('number')
      expect(stress as number).toBeGreaterThanOrEqual(0)
      expect(stress as number).toBeLessThanOrEqual(1)
      // merged population counters are present as metrics too
      expect(o.metrics['population.alive']).toBe(o.alive)
      expect(o.metrics['population.persons']).toBe(o.population)
      const share = o.metrics['population.childrenShare'] as number
      expect(share).toBeGreaterThanOrEqual(0)
      expect(share).toBeLessThanOrEqual(1)
    }

    // same arm+seed ⇒ identical digest across independent executions (engine replay,
    // now exercised over the economy+psychology stack)
    const control42 = runExperiment(singleCell(EXP002, EXP002.arms[0] as ExperimentArm, 42), testSystemsFactory)
    const treatment44 = runExperiment(singleCell(EXP002, EXP002.arms[1] as ExperimentArm, 44), testSystemsFactory)
    expect(control42.outcomes[0]?.digest).toBe(outcomeFor(result, 'control', 42).digest)
    expect(treatment44.outcomes[0]?.digest).toBe(outcomeFor(result, 'treatment', 44).digest)
  }, 600_000)

  it('EXP-002 direction: mass unemployment raises model stress (treatment > control)', () => {
    const [control, treatment] = summarize(EXP002_RESULT, 'stress.mean')

    if (control === undefined || treatment === undefined) throw new Error('arm summaries missing')
    expect(control.arm).toBe('control')
    expect(treatment.arm).toBe('treatment')
    expect(control.n).toBe(3)
    // model-internal mechanism check only — no real-world causal claim
    expect(treatment.mean).toBeGreaterThan(control.mean)
  })

  it('supports injected clocks and disabling the monthly invariant checker', () => {
    const tiny: ExperimentConfig = { ...EXP002, seeds: [42], population: 20, years: 1 }
    let calls = 0
    const result = runExperiment(tiny, testSystemsFactory, {
      now: () => ++calls * 5, // deterministic fake clock, no Date.now
      invariantChecks: false
    })
    expect(result.outcomes.length).toBe(2)
    for (const o of result.outcomes) {
      expect(o.runtimeMs).toBe(5)
      // engine.run() always records a final invariant sweep, flag or not
      expect(typeof o.metrics['invariant_checks_last']).toBe('number')
    }
  })
})

describe('summarize', () => {
  it('throws an error naming the arm when a metric is missing', () => {
    const synthetic: ExperimentResult = {
      config: EXP002,
      outcomes: [
        { arm: 'control', seed: 1, alive: 1, population: 1, digest: 'aaaaaaaa', runtimeMs: 0, metrics: { 'stress.mean': 0.5 } },
        { arm: 'treatment', seed: 1, alive: 1, population: 1, digest: 'bbbbbbbb', runtimeMs: 0, metrics: {} }
      ]
    }
    expect(() => summarize(synthetic, 'stress.mean')).toThrow(/treatment/)
    expect(() => summarize(synthetic, 'stress.mean')).toThrow(/stress\.mean/)
  })

  it('aggregates per arm in config order with known numbers', () => {
    const mk = (arm: string, seed: number, v: number): RunOutcome => ({
      arm,
      seed,
      alive: 1,
      population: 1,
      digest: 'deadbeef',
      runtimeMs: 0,
      metrics: { m: v }
    })
    const result: ExperimentResult = {
      config: EXP002,
      outcomes: [mk('control', 42, 1), mk('control', 43, 3), mk('treatment', 42, 10), mk('treatment', 43, 10)]
    }
    const [control, treatment] = summarize(result, 'm')
    if (control === undefined || treatment === undefined) throw new Error('arm summaries missing')
    expect(control).toEqual({ arm: 'control', n: 2, mean: 2, stdDev: 1, ci95: 1.96 / Math.SQRT2 })
    expect(treatment.mean).toBe(10)
    expect(treatment.stdDev).toBe(0)
    expect(treatment.ci95).toBe(0)
  })
})
