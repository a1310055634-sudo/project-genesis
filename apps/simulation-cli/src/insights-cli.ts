import * as fs from 'node:fs'
import type { RunManifest } from './main'
import { buildInsights, formatInsights } from './insights'

/**
 * Insights CLI (Roadmap C3): stylized-fact report from a run manifest.
 *   npm run insights -- <manifest.json> [--out insights.md]
 */
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
  if (positional.length !== 1) {
    throw new Error('usage: npm run insights -- <manifest.json> [--out insights.md]')
  }
  const path = positional[0]
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<RunManifest>
  if (typeof manifest.population !== 'object' || manifest.population === null) {
    throw new Error(`not a run manifest: ${path}`)
  }
  const m = manifest as RunManifest
  const report = formatInsights(path, m, buildInsights(m))
  if (out !== null) {
    fs.writeFileSync(out, report + '\n')
    console.log(`insights written: ${out}`)
  } else {
    console.log(report)
  }
}

main()
