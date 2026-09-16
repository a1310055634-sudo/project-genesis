import * as fs from 'node:fs'
import type { RunManifest } from './main'
import { compareManifests, formatReport } from './compare'

/**
 * Run compare CLI (GEN-135 / Roadmap D1):
 *   npm run compare -- <manifestA.json> <manifestB.json> [--out report.md]
 */
function loadManifest(path: string): RunManifest {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<RunManifest>
  if (typeof raw.digest !== 'string' || typeof raw.metrics !== 'object' || raw.metrics === null) {
    throw new Error(`not a run manifest: ${path}`)
  }
  return raw as RunManifest
}

function main(): void {
  const args = process.argv.slice(2)
  const positional: string[] = []
  let out: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      out = args[++i] ?? null
    } else {
      positional.push(args[i])
    }
  }
  if (positional.length !== 2) {
    throw new Error('usage: npm run compare -- <a.json> <b.json> [--out report.md]')
  }
  const [aPath, bPath] = positional
  const a = loadManifest(aPath)
  const b = loadManifest(bPath)
  const diff = compareManifests(a, b)
  const report = formatReport(aPath, bPath, a, b, diff)
  if (out !== null) {
    fs.writeFileSync(out, report + '\n')
    console.log(`report written: ${out}`)
  } else {
    console.log(report)
  }
}

main()
