import * as fs from 'node:fs'
import { TICKS_PER_MONTH } from '@genesis/core'
import * as path from 'node:path'
import { EXPERIMENTS, reportMarkdown, runExperiment, sampleSummarize, toCsv } from '@genesis/experiments'
import { fullStackSystems } from './profile'

/**
 * Experiment CLI (Wave 5 / GEN-150+): `npm run exp -- --id EXP-002 [--out out/experiments]`
 * Runs every arm × seed of a preset experiment with the full society stack
 * and writes byte-reproducible CSV + a markdown report.
 */
export function runExperimentCli(id: string, outDir: string): { csvPath: string; mdPath: string } {
  const config = EXPERIMENTS[id]
  if (config === undefined) {
    throw new Error(`unknown experiment '${id}'. Available: ${Object.keys(EXPERIMENTS).sort().join(', ')}`)
  }
  console.log(`=== Experiment ${config.id}: ${config.question} ===`)
  // always sample the experiment's own headline metric (watchdog fix: the
  // EXP-006 window was empty because social_edges was never sampled)
  const primaryMetric = PRIMARY_METRIC[config.id] ?? 'stress.mean'
  const sampleMetrics = [...new Set(['stress.mean', 'wellbeing.mean', 'population', primaryMetric])]
  const result = runExperiment(config, () => fullStackSystems().systems, { sampleMetrics })
  for (const summary of result.outcomes) {
    console.log(`  arm=${summary.arm} seed=${summary.seed} alive=${summary.alive} runtime=${summary.runtimeMs}ms digest=${summary.digest}`)
  }
  fs.mkdirSync(outDir, { recursive: true })
  const csvPath = path.join(outDir, `${config.id}.csv`)
  const mdPath = path.join(outDir, `${config.id}.md`)
  fs.writeFileSync(csvPath, toCsv(result))
  fs.writeFileSync(mdPath, reportMarkdown(result, primaryMetric))
  // GEN-151b: early-window summary catches transient effects endpoint means dilute
  const window = sampleSummarize(result, primaryMetric, TICKS_PER_MONTH, 6 * TICKS_PER_MONTH)
  const windowLines = window
    .map((w) => `  arm=${w.arm} n=${w.n} mean=${Math.round(w.mean * 1e6) / 1e6} ± ${Math.round(w.ci95 * 1e6) / 1e6}`)
    .join('\n')
  fs.appendFileSync(mdPath, `\n## Early-window means (months 1-6, ${primaryMetric})\n\n${windowLines}\n`)
  console.log(`window (months 1-6):`)
  console.log(windowLines)
  console.log(`csv     : ${csvPath}`)
  console.log(`report  : ${mdPath}`)
  return { csvPath, mdPath }
}

/** Headline metric per experiment (the one its question is about). */
const PRIMARY_METRIC: Record<string, string> = {
  'EXP-004': 'stress.mean',
  'EXP-029': 'income.max',
  'EXP-003': 'stress.mean',
  'EXP-002': 'stress.mean',
  'EXP-006': 'social_edges',
  'EXP-027': 'population',
  'EXP-SANITY': 'population'
}

function parseArgs(argv: string[]): { id: string; out: string } {
  const args: Record<string, string> = {}
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unknown argument: ${key}`)
    args[key.slice(2)] = argv[i + 1] ?? ''
    i++
  }
  return { id: args.id ?? 'EXP-002', out: args.out ?? 'out/experiments' }
}

if (require.main === module) {
  const { id, out } = parseArgs(process.argv)
  runExperimentCli(id, out)
}
