import { ExperimentResult } from './runner'
import { summarize } from './runner'

/**
 * Deterministic exports (guide §28 spirit): the same ExperimentResult always
 * serializes to the exact same bytes. Floating-point values are allowed only
 * as statistical aggregates / model-computed floats and are uniformly rounded
 * to 6 decimal places here (documented convention) before serialization —
 * no other float mangling happens anywhere in this package.
 */

/** Round to 6 decimals; the single rounding rule applied to every CSV number. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
}

function csvNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`toCsv: non-finite number ${n} cannot be exported`)
  const rounded = round6(n)
  // red team RT2-05: rounding a huge finite value can overflow to Infinity
  if (!Number.isFinite(rounded)) throw new Error(`toCsv: number ${n} overflows when rounded`)
  return String(rounded)
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * CSV export. Columns: arm, seed, digest, runtimeMs, then every metric key
 * observed across outcomes in lexicographic order. Rows sorted by
 * (arm, seed-as-string). All numbers rounded to 6 decimals. LF line endings,
 * trailing newline — byte-reproducible for identical results.
 */
export function toCsv(result: ExperimentResult): string {
  const metricKeys = new Set<string>()
  for (const outcome of result.outcomes) {
    for (const key of Object.keys(outcome.metrics)) metricKeys.add(key)
  }
  const header = ['arm', 'seed', 'digest', 'runtimeMs', ...Array.from(metricKeys).sort(compareStrings)]

  const rows = [...result.outcomes].sort(
    (a, b) => compareStrings(a.arm, b.arm) || compareStrings(String(a.seed), String(b.seed))
  )

  const lines: string[] = [header.map(csvCell).join(',')]
  for (const outcome of rows) {
    const cells = header.map((column) => {
      switch (column) {
        case 'arm':
          return outcome.arm
        case 'seed':
          return String(outcome.seed)
        case 'digest':
          return outcome.digest
        case 'runtimeMs':
          return csvNumber(outcome.runtimeMs)
        default: {
          const v = outcome.metrics[column]
          // Metrics are heterogeneous across runs: event-dependent gauges
          // (e.g. 'family.estates_unclaimed_cents') only exist when the
          // triggering event happened. Missing → empty CSV cell (NOT 0,
          // which would falsely claim the gauge was recorded as zero).
          if (v === undefined) return ''
          return csvNumber(v)
        }
      }
    })
    lines.push(cells.map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

/**
 * Human-readable markdown summary for one metric: per-arm n and mean ± ci95,
 * with a direction verdict of each treatment arm against the baseline
 * control (arms[0]) computed inside the model. Contains no real-world causal
 * language — directions describe model-internal behavior only.
 */
export function reportMarkdown(result: ExperimentResult, metric: string): string {
  const summaries = summarize(result, metric)
  if (summaries.length === 0) throw new Error(`reportMarkdown: experiment ${result.config.id} has no arms`)
  const baseline = summaries[0] as { arm: string; mean: number }

  const lines: string[] = []
  lines.push(`# Experiment ${result.config.id}`)
  lines.push('')
  lines.push(result.config.question)
  lines.push('')
  lines.push(`Metric: \`${metric}\`. All values are model-internal aggregates over ${result.config.seeds.length} seeded runs per arm.`)
  lines.push('')
  lines.push('| arm | n | mean ± ci95 | direction vs baseline |')
  lines.push('| --- | --- | --- | --- |')
  for (const s of summaries) {
    const estimate = `${String(round6(s.mean))} ± ${String(round6(s.ci95))}`
    let direction: string
    if (s.arm === baseline.arm) {
      direction = 'baseline'
    } else if (s.mean > baseline.mean) {
      direction = 'higher'
    } else if (s.mean < baseline.mean) {
      direction = 'lower'
    } else {
      direction = 'same'
    }
    lines.push(`| ${s.arm} | ${s.n} | ${estimate} | ${direction} |`)
  }
  lines.push('')
  lines.push(`Seeds: ${result.config.seeds.map((s) => String(s)).join(', ')} · population ${result.config.population} · ${result.config.years}y per run.`)
  return lines.join('\n') + '\n'
}
