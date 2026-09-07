import { demographicsSystem, Simulation } from '@genesis/simulation'

/**
 * Benchmark harness (GEN-134). Guide §26: record runtime, peak memory,
 * events, events/sec. No optimization without profile evidence.
 */
interface BenchResult {
  population: number
  years: number
  runtimeMs: number
  peakRssMB: number
  alive: number
  events: number
  eventsPerSec: number
  digest: string
}

function runBench(population: number, years: number): BenchResult {
  global.gc?.()
  const t0 = Date.now()
  const sim = Simulation.create({ seed: 42, populationTarget: population, years }, { systems: [demographicsSystem] })
  sim.run()
  const runtimeMs = Date.now() - t0
  const rss = process.memoryUsage().rss / (1024 * 1024)
  const events = sim.ctx.log.count
  const result: BenchResult = {
    population,
    years,
    runtimeMs,
    peakRssMB: Math.round(rss * 10) / 10,
    alive: sim.ctx.world.persons.filter((p) => p.alive).length,
    events,
    eventsPerSec: Math.round(events / (runtimeMs / 1000)),
    digest: sim.digest()
  }
  return result
}

function formatRow(r: BenchResult): string {
  return (
    `| ${r.population.toLocaleString()} | ${r.years} | ${r.runtimeMs.toLocaleString()} ms | ${r.peakRssMB} MB | ` +
    `${r.alive.toLocaleString()} | ${r.events.toLocaleString()} | ${r.eventsPerSec.toLocaleString()} | ${r.digest} |`
  )
}

const sizes: Array<[number, number]> = [
  [1_000, 1],
  [10_000, 1]
]
const extra = process.argv.length > 2 ? process.argv.slice(2).map(Number) : []

console.log('| population | years | runtime | peak RSS | alive | events | events/sec | digest |')
console.log('|---|---|---|---|---|---|---|---|')
for (const [pop, years] of sizes) {
  console.log(formatRow(runBench(pop, years)))
}
for (let i = 0; i < extra.length; i += 2) {
  console.log(formatRow(runBench(extra[i] as number, extra[i + 1] as number)))
}
