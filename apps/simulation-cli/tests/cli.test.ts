import { describe, it, expect } from 'vitest'
import { runCli, RunManifest } from '../src/main'

describe('simulation CLI', () => {
  it('produces a complete run manifest for a small run', () => {
    const manifest: RunManifest = runCli({ seed: 42, population: 200, years: 1 })
    expect(manifest.runId).toContain('42')
    expect(manifest.tick).toBe(8640)
    expect(manifest.population.persons).toBeGreaterThanOrEqual(200)
    expect(manifest.population.households).toBeGreaterThan(0)
    expect(manifest.digest).toMatch(/^[0-9a-f]{8}$/)
    expect(manifest.runtimeMs).toBeGreaterThanOrEqual(0)
    expect(manifest.events.totalEvents).toBeGreaterThan(0)
    expect(manifest.metrics['population']).toBeGreaterThan(0)
  })

  it('replays deterministically through the CLI path', () => {
    const a = runCli({ seed: 42, population: 150, years: 1 })
    const b = runCli({ seed: 42, population: 150, years: 1 })
    expect(a.digest).toBe(b.digest)
    expect(a.metrics).toEqual(b.metrics)
  })
})
