import { describe, expect, it } from 'vitest'
import { demographicsSystem } from '@genesis/simulation'
import { ExperimentResult, EXPERIMENTS, reportMarkdown, runExperiment, toCsv } from '@genesis/experiments'

// Fast, fully deterministic stack for export tests (no economy/psychology needed).
const tinyFactory = () => [demographicsSystem]

function tinyResult(): ExperimentResult {
  const config = EXPERIMENTS['EXP-SANITY']
  if (config === undefined) throw new Error('EXP-SANITY preset missing')
  return runExperiment({ ...config, seeds: [42, 43], years: 1 }, tinyFactory)
}

function syntheticResult(): ExperimentResult {
  const config = EXPERIMENTS['EXP-002']
  if (config === undefined) throw new Error('EXP-002 preset missing')
  const mk = (arm: string, seed: number, stress: number): ExperimentResult['outcomes'][number] => ({
    arm,
    seed,
    alive: 100,
    population: 100,
    digest: 'deadbeef',
    runtimeMs: 0,
    metrics: { 'stress.mean': stress, 'zeta.count': 3, 'alpha.gauge': stress / 3 }
  })
  return {
    config,
    outcomes: [mk('control', 43, 0.2), mk('control', 42, 0.1), mk('treatment', 42, 0.9), mk('treatment', 43, 0.8)]
  }
}

describe('toCsv determinism', () => {
  it('is byte-identical across two independent runs of the same experiment', () => {
    const first = toCsv(tinyResult())
    const second = toCsv(tinyResult())
    expect(first).toBe(second)
  }, 120_000)

  it('orders metric columns lexicographically after the fixed arm/seed/digest/runtimeMs prefix', () => {
    const csv = toCsv(syntheticResult())
    const [header] = csv.split('\n')
    if (header === undefined) throw new Error('empty csv')
    const columns = header.split(',')
    expect(columns.slice(0, 4)).toEqual(['arm', 'seed', 'digest', 'runtimeMs'])
    const metricColumns = columns.slice(4)
    const sorted = [...metricColumns].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    expect(metricColumns).toEqual(sorted)
    expect(metricColumns).toEqual(['alpha.gauge', 'stress.mean', 'zeta.count'])
  })

  it('sorts rows by (arm, seed string) and rounds floats to 6 decimals', () => {
    const csv = toCsv(syntheticResult())
    const rows = csv.split('\n').filter((line) => line.length > 0).slice(1)
    expect(rows.map((r) => r.split(',').slice(0, 2).join('/'))).toEqual([
      'control/42',
      'control/43',
      'treatment/42',
      'treatment/43'
    ])
    // stress 0.1 / 3 = 0.0333333... must appear rounded to 6 decimals
    expect(rows[0]).toContain('0.033333')
    expect(csv).not.toMatch(/\d\.\d{7,}/) // no cell carries more than 6 decimals
    expect(csv.endsWith('\n')).toBe(true)
  })
})

describe('reportMarkdown', () => {
  it('contains every arm name, numeric estimates, and a direction vs baseline', () => {
    const report = reportMarkdown(syntheticResult(), 'stress.mean')
    expect(report).toContain('EXP-002')
    expect(report).toContain('control')
    expect(report).toContain('treatment')
    expect(report).toContain('0.15') // control mean rounded
    expect(report).toContain('0.85') // treatment mean rounded
    expect(report).toContain('baseline')
    expect(report).toContain('higher')
    expect(report).toContain('| arm | n | mean ± ci95 | direction vs baseline |')
  })

  it('is deterministic for the same result', () => {
    const a = reportMarkdown(syntheticResult(), 'stress.mean')
    const b = reportMarkdown(syntheticResult(), 'stress.mean')
    expect(a).toBe(b)
  })
})

// Director integration fix: heterogeneous metrics across runs must export as
// empty cells, not crash (found wiring EXP-002 through the CLI).
describe('toCsv with heterogeneous metrics', () => {
  it('exports empty cells for metrics a run never recorded', async () => {
    const { toCsv } = await import('../src/export')
    const base = {
      arm: 'control',
      digest: 'deadbeef',
      runtimeMs: 0,
      alive: 10,
      population: 10
    }
    const result = {
      config: {
        id: 'T',
        question: 'test',
        seeds: [1, 2],
        population: 10,
        years: 1,
        arms: [{ name: 'control', overrides: {} }]
      },
      outcomes: [
        { ...base, seed: 1, metrics: { 'stress.mean': 0.5, 'family.estates_unclaimed_cents': 700 } },
        { ...base, seed: 2, metrics: { 'stress.mean': 0.6 } } // no estates gauge this run
      ]
    }
    const csv = toCsv(result as never)
    const header = csv.split('\n')[0]
    const rows = csv.trim().split('\n').slice(1)
    expect(header).toContain('family.estates_unclaimed_cents')
    const rowMissing = rows.find((r) => r.includes(',2,'))
    // empty cell (not 0) for the gauge this run never recorded
    expect(rowMissing).toBe('control,2,deadbeef,0,,0.6')
  })
})
