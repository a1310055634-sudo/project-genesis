import * as fs from 'node:fs'
import * as path from 'node:path'
import { configHash, demographicsSystem, populationStats, Simulation } from '@genesis/simulation'
import { fullStackSystems } from './profile'

/**
 * Simulation CLI (GEN-010): headless batch runner — guide §4.1.
 * Wall-clock time appears ONLY here (observability layer, guide §4.5).
 */
export interface CliArgs {
  seed: number | string
  population: number
  years: number
  out?: string
  checkInvariants?: boolean
  /** 'full' (default): demography+social+economy+psychology. 'minimal': demography only. */
  profile?: 'full' | 'minimal'
}

export interface RunManifest {
  runId: string
  seed: number | string
  configHash: string
  tick: number
  simulatedYears: number
  startedAtWallClock: string
  endedAtWallClock: string
  runtimeMs: number
  digest: string
  population: {
    persons: number
    alive: number
    children: number
    adults: number
    seniors: number
    households: number
    employers: number
    employed: number
    unemploymentRate: number
  }
  metrics: Record<string, number>
  events: { totalEvents: number; byType: Record<string, number> }
}

export function runCli(args: CliArgs): RunManifest {
  const startedAtWallClock = new Date().toISOString()
  const t0 = Date.now()

  const profile = args.profile ?? 'full'
  const systems = profile === 'minimal' ? [demographicsSystem] : fullStackSystems().systems
  const sim = Simulation.create(
    { seed: args.seed, populationTarget: args.population, years: args.years },
    { systems, checkInvariants: args.checkInvariants !== false }
  )
  sim.run()

  const runtimeMs = Date.now() - t0
  const endedAtWallClock = new Date().toISOString()
  const stats = populationStats(sim.ctx)
  const manifest: RunManifest = {
    runId: `run-${args.seed}-${configHash(sim.ctx.config)}`,
    seed: args.seed,
    configHash: configHash(sim.ctx.config),
    tick: sim.ctx.clock.tick,
    simulatedYears: args.years,
    startedAtWallClock,
    endedAtWallClock,
    runtimeMs,
    digest: sim.digest(),
    population: {
      persons: stats.persons,
      alive: stats.alive,
      children: stats.children,
      adults: stats.adults,
      seniors: stats.seniors,
      households: stats.households,
      employers: stats.employers,
      employed: stats.employed,
      unemploymentRate: Math.round(stats.unemploymentRate * 10000) / 10000
    },
    metrics: sim.ctx.metrics.snapshot(),
    events: sim.ctx.log.stats()
  }

  if (args.out) {
    fs.mkdirSync(args.out, { recursive: true })
    const file = path.join(args.out, `${manifest.runId}.json`)
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
  }
  return manifest
}

function printSummary(manifest: RunManifest, outFile: string | null): void {
  const p = manifest.population
  const m = manifest.metrics
  console.log('=== Project Genesis run ===')
  console.log(`run id        : ${manifest.runId}`)
  console.log(`seed          : ${manifest.seed}`)
  console.log(`simulated     : ${manifest.simulatedYears}y (tick ${manifest.tick})`)
  console.log(`runtime       : ${manifest.runtimeMs} ms`)
  console.log(`population    : ${p.alive} alive / ${p.persons} ever-born`)
  console.log(`households    : ${p.households}`)
  console.log(`employers     : ${p.employers} (employed: ${p.employed}, unemployment: ${(p.unemploymentRate * 100).toFixed(1)}%)`)
  console.log(`ages          : children ${p.children} / adults ${p.adults} / seniors ${p.seniors}`)
  console.log(`society       : mean stress ${fmt(m['stress.mean'])} · mean wellbeing ${fmt(m['wellbeing.mean'])} · relationships ${fmt(m['social_edges'])}`)
  console.log(`economy       : employment ${fmt(m['employment_rate'])} · mean wealth $${fmt((m['mean_wealth'] ?? 0) / 100)}`)
  console.log(`events        : ${manifest.events.totalEvents}`)
  console.log(`digest        : ${manifest.digest}`)
  console.log(`manifest      : ${outFile ?? '(stdout only)'}`)
}

function fmt(v: number | undefined): string {
  if (v === undefined) return 'n/a'
  return String(Math.round(v * 1000) / 1000)
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {}
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unknown argument: ${key} (expected --key value)`)
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`missing value for ${key}`)
    args[key.slice(2)] = value
    i++
  }
  return {
    seed: args.seed !== undefined && /^\d+$/.test(args.seed) ? Number(args.seed) : (args.seed ?? 42),
    population: args.population !== undefined ? Number(args.population) : 1_000,
    years: args.years !== undefined ? Number(args.years) : 1,
    out: args.out,
    profile: args.profile === 'minimal' ? 'minimal' : 'full'
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv)
  const manifest = runCli(args)
  printSummary(manifest, args.out ?? null)
}
