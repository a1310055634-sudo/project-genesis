import * as fs from 'node:fs'
import * as path from 'node:path'
import { EXPERIMENTS, reportMarkdown, runExperiment, toCsv } from '@genesis/experiments'
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
  const result = runExperiment(config, () => fullStackSystems().systems)
  for (const summary of result.outcomes) {
    console.log(`  arm=${summary.arm} seed=${summary.seed} alive=${summary.alive} runtime=${summary.runtimeMs}ms digest=${summary.digest}`)
  }
  fs.mkdirSync(outDir, { recursive: true })
  const csvPath = path.join(outDir, `${config.id}.csv`)
  const mdPath = path.join(outDir, `${config.id}.md`)
  fs.writeFileSync(csvPath, toCsv(result))
  fs.writeFileSync(mdPath, reportMarkdown(result, 'stress.mean'))
  console.log(`csv     : ${csvPath}`)
  console.log(`report  : ${mdPath}`)
  return { csvPath, mdPath }
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
