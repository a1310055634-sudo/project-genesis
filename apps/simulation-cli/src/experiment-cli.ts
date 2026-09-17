import * as fs from 'node:fs'
import { TICKS_PER_MONTH } from '@genesis/core'
import * as path from 'node:path'
import { EXPERIMENTS, FACTORIALS, formatSeedStability, reportMarkdown, runExperiment, runFactorial, sampleSummarize, seedStability, toCsv } from '@genesis/experiments'
import { fullStackSystems } from './profile'

/**
 * Experiment CLI (Wave 5 / GEN-150+): `npm run exp -- --id EXP-002 [--out out/experiments]`
 * Runs every arm × seed of a preset experiment with the full society stack
 * and writes byte-reproducible CSV + a markdown report.
 */
export function runExperimentCli(id: string, outDir: string, stability: boolean): { csvPath: string; mdPath: string } {
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
  // Roadmap C2: per-seed paired effects — sign flips must surface, not average away
  if (stability) {
    const section = formatSeedStability(seedStability(result, primaryMetric), primaryMetric)
    fs.appendFileSync(mdPath, section + '\n')
    console.log(section)
  }
  console.log(`csv     : ${csvPath}`)
  console.log(`report  : ${mdPath}`)
  return { csvPath, mdPath }
}

function runFactorialCli(id: string, outDir: string): void {
  const spec = FACTORIALS[id]
  if (spec === undefined) {
    throw new Error(`unknown factorial '${id}'. Available: ${Object.keys(FACTORIALS).sort().join(', ')}`)
  }
  console.log(`=== Factorial ${spec.id}: ${spec.question} ===`)
  const { result, report } = runFactorial(spec, () => fullStackSystems().systems)
  for (const outcome of result.outcomes) {
    console.log(`  arm=${outcome.arm} seed=${outcome.seed} digest=${outcome.digest}`)
  }
  fs.mkdirSync(outDir, { recursive: true })
  const csvPath = path.join(outDir, `${spec.id}.csv`)
  const mdPath = path.join(outDir, `${spec.id}.md`)
  fs.writeFileSync(csvPath, toCsv(result))
  fs.writeFileSync(mdPath, report + '\n')
  console.log(`csv     : ${csvPath}`)
  console.log(`report  : ${mdPath}`)
}

/** Headline metric per experiment (the one its question is about). */
const PRIMARY_METRIC: Record<string, string> = {
  'EXP-004': 'stress.mean',
  'EXP-025': 'stress.mean',
  'EXP-021': 'media_last_piece_heard',
  'EXP-022': 'media_hearings_total',
  'EXP-030': 'stress.mean',
  'EXP-029': 'income.max',
  'EXP-003': 'stress.mean',
  'EXP-002': 'stress.mean',
  'EXP-006': 'social_edges',
  'EXP-027': 'population',
  'EXP-SANITY': 'population'
}

function parseArgs(argv: string[]): { id: string; out: string; factorial: string | null; stability: boolean } {
  const args: Record<string, string> = {}
  const valueless = new Set(['stability'])
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unknown argument: ${key}`)
    const name = key.slice(2)
    if (valueless.has(name)) {
      args[name] = '1'
    } else {
      args[name] = argv[i + 1] ?? ''
      i++
    }
  }
  return {
    id: args.id ?? 'EXP-002',
    out: args.out ?? 'out/experiments',
    factorial: args.factorial ?? null,
    stability: args.stability === '1'
  }
}

if (require.main === module) {
  const { id, out, factorial, stability } = parseArgs(process.argv)
  if (factorial !== null) runFactorialCli(factorial, out)
  else runExperimentCli(id, out, stability)
}
