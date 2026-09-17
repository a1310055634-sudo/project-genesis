import type { RunManifest } from './main'

/**
 * Insight report generator (Roadmap C3): derives stylized facts from a run
 * manifest's final snapshot — demography, generational turnover, economy,
 * institutional sustainability, information dynamics. Pure functions; every
 * fact degrades to 'n/a' when its metric keys are absent (older manifests,
 * minimal profiles). Thresholds are documented next to each rule.
 */

export interface Insight {
  title: string
  value: string
  note?: string
}

export interface InsightSection {
  title: string
  insights: Insight[]
}

const num = (m: Record<string, number>, key: string): number | null => {
  const v = m[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`
const dollars = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

function share(numerator: number | null, denominator: number): number | null {
  if (numerator === null || denominator <= 0) return null
  return numerator / denominator
}

export function buildInsights(m: RunManifest): InsightSection[] {
  const sections: InsightSection[] = []
  const p = m.population
  const mm = m.metrics ?? {}

  // --- demography ---
  const demo: Insight[] = []
  const survival = share(p.alive, p.persons)
  if (survival !== null) {
    const verdict = survival < 0.5 ? 'CONTRACTION' : survival < 0.8 ? 'shrinking' : 'sustaining'
    demo.push({
      title: 'ever-born survival',
      value: pct(survival),
      note: `${p.alive.toLocaleString('en-US')} alive of ${p.persons.toLocaleString('en-US')} ever-born → ${verdict}`
    })
  }
  const seniorShare = share(p.seniors, p.alive)
  if (seniorShare !== null) {
    demo.push({
      title: 'senior share',
      value: pct(seniorShare),
      note: seniorShare > 0.25 ? 'inverted pyramid (seniors > 25%)' : undefined
    })
  }
  const childShare = share(p.children, p.alive)
  if (childShare !== null) {
    demo.push({
      title: 'child share',
      value: pct(childShare),
      note: childShare < 0.1 ? 'birth pipeline thin (children < 10% of alive)' : undefined
    })
  }
  const avgHousehold = num(mm, 'family.avg_household_size')
  if (avgHousehold !== null) demo.push({ title: 'mean household size', value: String(avgHousehold) })
  sections.push({ title: 'Demography', insights: demo })

  // --- generational turnover (cohort gauges, Roadmap A4) ---
  const gen: Insight[] = []
  const cohortAlive: Array<{ decade: number; alive: number }> = []
  for (const [key, value] of Object.entries(mm)) {
    const match = key.match(/^cohort\.d(-?\d+)\.alive$/)
    if (match !== null) cohortAlive.push({ decade: Number(match[1]), alive: value })
  }
  const tracked = num(mm, 'cohort.tracked')
  if (cohortAlive.length > 0) {
    const founders = cohortAlive.filter((c) => c.decade < 0)
    const founderAlive = founders.reduce((s, c) => s + c.alive, 0)
    gen.push({
      title: 'founder generation',
      value: founderAlive === 0 ? 'EXTINCT' : `${founderAlive.toLocaleString('en-US')} alive`,
      note: `${founders.length} founder decade-cohorts (d-9…d-1)`
    })
    const living = [...cohortAlive].filter((c) => c.alive > 0).sort((x, y) => y.alive - x.alive)
    if (living.length > 0) {
      gen.push({
        title: 'dominant living cohort',
        value: `d${living[0].decade}`,
        note: `${living[0].alive.toLocaleString('en-US')} alive across ${living.length} living cohorts (tracked ${tracked ?? 'n/a'})`
      })
    }
  } else {
    gen.push({ title: 'cohort gauges', value: 'n/a', note: 'run predates A4 analytics' })
  }
  sections.push({ title: 'Generational turnover', insights: gen })

  // --- economy ---
  const eco: Insight[] = []
  const meanWealth = num(mm, 'mean_wealth')
  if (meanWealth !== null) eco.push({ title: 'mean wealth', value: dollars(meanWealth) })
  const employment = num(mm, 'employment_rate')
  if (employment !== null) eco.push({ title: 'employment rate', value: pct(employment) })
  const pensionPaid = num(mm, 'economy.pension_paid_cents')
  const pensionDeficit = num(mm, 'economy.pension_deficit_cents')
  if (pensionPaid !== null && pensionPaid > 0) {
    const deficitShare = (pensionDeficit ?? 0) / pensionPaid
    eco.push({
      title: 'pension pool sustainability',
      value: pct(1 - deficitShare),
      note:
        deficitShare >= 0.999
          ? 'fully deficit-created over the whole run'
          : deficitShare > 0
            ? `deficit share ${pct(deficitShare)}`
            : undefined
    })
  }
  sections.push({ title: 'Economy', insights: eco })

  // --- institutions ---
  const inst: Insight[] = []
  const fundingRatio = num(mm, 'institutions_funding_ratio')
  if (fundingRatio !== null) {
    inst.push({
      title: 'school funding ratio',
      value: pct(fundingRatio),
      note: fundingRatio === 0 ? 'schools never funded — pool chronically dry' : undefined
    })
  }
  const pupils = num(mm, 'institutions_pupils_assigned')
  const overflow = num(mm, 'institutions_overflow_pupils')
  if (pupils !== null && overflow !== null) {
    inst.push({ title: 'pupils / overflow', value: `${pupils} / ${overflow}` })
  }
  sections.push({ title: 'Institutions', insights: inst })

  // --- information dynamics ---
  const info: Insight[] = []
  const conversions = num(mm, 'media_beliefs_total')
  const lapses = num(mm, 'media_beliefs_lapsed')
  if (conversions !== null && lapses !== null && conversions > 0) {
    info.push({ title: 'belief churn (lapsed/conversions)', value: pct(lapses / conversions) })
  }
  const pieces = num(mm, 'media_pieces')
  const rumors = num(mm, 'media_rumors_spawned')
  if (pieces !== null && rumors !== null && pieces > 0) {
    info.push({ title: 'rumor share of pieces', value: pct(rumors / pieces), note: `${rumors} of ${pieces}` })
  }
  const lastBelieved = num(mm, 'media_last_piece_believed')
  const penetration = share(lastBelieved, p.alive)
  if (penetration !== null) {
    info.push({
      title: 'last-piece penetration',
      value: pct(penetration),
      note: penetration > 0.5 ? 'high — small connected population' : undefined
    })
  }
  sections.push({ title: 'Information dynamics', insights: info })

  // --- social fabric ---
  const social: Insight[] = []
  const degree = num(mm, 'social_mean_degree')
  if (degree !== null) social.push({ title: 'mean degree', value: String(degree) })
  const isolation = num(mm, 'social_isolation_rate')
  if (isolation !== null) social.push({ title: 'isolation rate', value: pct(isolation) })
  sections.push({ title: 'Social fabric', insights: social })

  return sections
}

export function formatInsights(path: string, m: RunManifest, sections: InsightSection[]): string {
  const lines: string[] = []
  lines.push(`# Insights — ${path}`)
  lines.push('')
  lines.push(`seed ${m.seed} · ${m.simulatedYears}y · tick ${m.tick} · digest \`${m.digest}\` · runtime ${(m.runtimeMs / 1000).toFixed(1)}s`)
  for (const section of sections) {
    lines.push('')
    lines.push(`## ${section.title}`)
    for (const insight of section.insights) {
      lines.push(`- **${insight.title}**: ${insight.value}${insight.note !== undefined ? ` — ${insight.note}` : ''}`)
    }
    if (section.insights.length === 0) lines.push('- n/a')
  }
  return lines.join('\n')
}
