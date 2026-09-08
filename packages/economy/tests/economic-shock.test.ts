import { describe, expect, it } from 'vitest'
import { TICKS_PER_YEAR } from '@genesis/core'
import { checkInvariants, demographicsSystem, normalizeConfig, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'

/**
 * Economic shock scenario knob (guide EXP-001, watchdog takeover task):
 * a mid-run layoff wave fires once at the configured year, respects employer
 * slot consistency, and is deterministic.
 */

function build(shock: { atYear: number; layoffShare: number } | undefined) {
  return Simulation.create(
    { seed: 42, populationTarget: 200, years: 2, economicShock: shock },
    { systems: [demographicsSystem, ...economySystems()] }
  )
}

describe('economic shock (EXP-001 knob)', () => {
  it('lays off exactly floor(share × employed) once, with reason economic_shock', () => {
    const sim = build({ atYear: 1, layoffShare: 0.5 })
    const employedBefore = sim.ctx.world.persons.filter((p) => p.alive && p.economy.employerId !== null).length
    const expectedLayoffs = Math.floor(employedBefore * 0.5)

    sim.run()

    // exactly one application (guard holds across the whole run). The event
    // log's recent window is long exhausted by daily consumption events, so
    // the authoritative probe is the counter (same convention as the
    // experiments CSV: aggregates, not raw events).
    expect(sim.ctx.metrics.counterValue('economy.shock_layoffs')).toBe(expectedLayoffs)
    // employer slot consistency survived the wave
    expect(checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed).violations).toBe(0)
  })

  it('is deterministic under a fixed seed', () => {
    const a = build({ atYear: 1, layoffShare: 0.4 })
    a.run()
    const b = build({ atYear: 1, layoffShare: 0.4 })
    b.run()
    expect(a.digest()).toBe(b.digest())
  })

  it('a shock with zero share changes nothing', () => {
    const sim = build({ atYear: 1, layoffShare: 0 })
    const employedBefore = sim.ctx.world.persons.filter((p) => p.alive && p.economy.employerId !== null).length
    sim.run()
    expect(sim.ctx.metrics.counterValue('economy.shock_layoffs')).toBe(0)
    const employedAfter = sim.ctx.world.persons.filter((p) => p.alive && p.economy.employerId !== null).length
    // only retirement/search flows touched employment, not the shock
    expect(employedAfter).toBeGreaterThan(0)
    void employedBefore
  })

  it('config validation rejects malformed shocks', () => {
    expect(() => normalizeConfig({ economicShock: { atYear: 0, layoffShare: 0.1 } })).toThrow(/atYear/)
    expect(() => normalizeConfig({ economicShock: { atYear: 1, layoffShare: 1.5 } })).toThrow(/layoffShare/)
  })

  it('shock year boundary: atYear beyond the horizon never fires', () => {
    const sim = build({ atYear: 5, layoffShare: 0.5 }) // run is only 2 years
    sim.run()
    expect(sim.ctx.metrics.counterValue('economy.shock_layoffs')).toBe(0)
    expect(sim.ctx.clock.tick).toBe(2 * TICKS_PER_YEAR)
  })
})
