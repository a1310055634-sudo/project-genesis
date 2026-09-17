import { describe, expect, it } from 'vitest'
import type { RunManifest } from '../src/main'
import { buildInsights, formatInsights } from '../src/insights'

/** Insight generator (Roadmap C3): stylized facts derived from a manifest
 * snapshot, with n/a degradation when keys are absent. */

function manifest(metrics: Record<string, number>, populationOverrides?: Partial<RunManifest['population']>): RunManifest {
  return {
    runId: 'run-42-t',
    seed: 42,
    configHash: 'cfg',
    tick: 86_400 * 10,
    simulatedYears: 10,
    startedAtWallClock: 't0',
    endedAtWallClock: 't1',
    runtimeMs: 5_000,
    digest: 'digest-t',
    population: {
      persons: 11_000,
      alive: 3_000,
      children: 200,
      adults: 2_000,
      seniors: 800,
      households: 1_500,
      employers: 100,
      employed: 1_800,
      unemploymentRate: 0.1,
      ...populationOverrides
    },
    metrics,
    events: { totalEvents: 1, byType: {} }
  }
}

describe('buildInsights (C3)', () => {
  it('derives demography, turnover, economy, institutions and information facts', () => {
    const m = manifest({
      'family.avg_household_size': 1.3,
      'cohort.d-9.alive': 0,
      'cohort.d-1.alive': 0,
      'cohort.d0.alive': 0,
      'cohort.d1.alive': 500,
      'cohort.d2.alive': 900,
      'cohort.tracked': 2,
      mean_wealth: 316_240_018,
      employment_rate: 1,
      'economy.pension_paid_cents': 350_543_393_126,
      'economy.pension_deficit_cents': 350_543_393_126,
      institutions_funding_ratio: 0,
      institutions_pupils_assigned: 36,
      institutions_overflow_pupils: 0,
      media_beliefs_total: 1_607_672,
      media_beliefs_lapsed: 1_483_572,
      media_pieces: 1_605,
      media_rumors_spawned: 320,
      media_last_piece_believed: 154,
      social_mean_degree: 13.6,
      social_isolation_rate: 0.009
    })
    const sections = buildInsights(m)
    const byId = (title: string) => sections.find((s) => s.title === title)
    expect(sections.map((s) => s.title)).toEqual([
      'Demography',
      'Generational turnover',
      'Economy',
      'Institutions',
      'Information dynamics',
      'Social fabric'
    ])
    const survival = byId('Demography')!.insights.find((i) => i.title === 'ever-born survival')!
    expect(survival.value).toBe('27.3%')
    expect(survival.note).toContain('CONTRACTION')
    const founders = byId('Generational turnover')!.insights.find((i) => i.title === 'founder generation')!
    expect(founders.value).toBe('EXTINCT')
    const dominant = byId('Generational turnover')!.insights.find((i) => i.title === 'dominant living cohort')!
    expect(dominant.value).toBe('d2')
    const pension = byId('Economy')!.insights.find((i) => i.title === 'pension pool sustainability')!
    expect(pension.value).toBe('0.0%')
    const funding = byId('Institutions')!.insights.find((i) => i.title === 'school funding ratio')!
    expect(funding.note).toContain('chronically dry')
    const churn = byId('Information dynamics')!.insights.find((i) => i.title === 'belief churn (lapsed/conversions)')!
    expect(Number.parseFloat(churn.value)).toBeCloseTo(92.3, 1)
  })

  it('degrades to n/a when the metric keys are absent', () => {
    const sections = buildInsights(manifest({}))
    // every lens is still REPORTED — empty sections render as '- n/a'
    expect(sections.length).toBe(6)
    const text = formatInsights('m.json', manifest({}), sections)
    expect(text).toContain('n/a')
    expect(text).toContain('# Insights — m.json')
    expect((text.match(/- n\/a/g) ?? []).length).toBe(4) // economy/institutions/info/social empty
  })
})
