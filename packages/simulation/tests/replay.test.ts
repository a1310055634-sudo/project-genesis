import { describe, it, expect } from 'vitest'
import { TICKS_PER_YEAR } from '@genesis/core'
import { demographicsSystem, Simulation } from '@genesis/simulation'

const REPLAY_CONFIG = { seed: 42, populationTarget: 300, years: 3 } as const

describe('deterministic replay (GEN-011 / guide §2.1)', () => {
  it('same seed + config ⇒ identical digest across independent runs', () => {
    const a = Simulation.create(REPLAY_CONFIG, { systems: [demographicsSystem] })
    a.run()
    const b = Simulation.create(REPLAY_CONFIG, { systems: [demographicsSystem] })
    b.run()
    expect(a.ctx.clock.tick).toBe(3 * TICKS_PER_YEAR)
    expect(a.digest()).toBe(b.digest())
  })

  it('digest is stable when replayed incrementally vs in one go', () => {
    const whole = Simulation.create(REPLAY_CONFIG, { systems: [demographicsSystem] })
    whole.run()
    const stepped = Simulation.create(REPLAY_CONFIG, { systems: [demographicsSystem] })
    for (let y = 0; y < 3; y++) stepped.runYears(1) // three relative one-year runs
    expect(stepped.digest()).toBe(whole.digest())
  })

  it('different seeds ⇒ different digests', () => {
    const a = Simulation.create({ ...REPLAY_CONFIG, seed: 42 }, { systems: [demographicsSystem] })
    a.run()
    const b = Simulation.create({ ...REPLAY_CONFIG, seed: 7 }, { systems: [demographicsSystem] })
    b.run()
    expect(a.digest()).not.toBe(b.digest())
  })

  it('string seeds work as replay keys', () => {
    const a = Simulation.create({ ...REPLAY_CONFIG, seed: 'genesis-night' }, { systems: [demographicsSystem] })
    a.run()
    const b = Simulation.create({ ...REPLAY_CONFIG, seed: 'genesis-night' }, { systems: [demographicsSystem] })
    b.run()
    expect(a.digest()).toBe(b.digest())
  })

  it('demography actually runs: births and deaths are recorded, population gauge set', () => {
    const sim = Simulation.create({ seed: 42, populationTarget: 1000, years: 10 }, { systems: [demographicsSystem] })
    sim.run()
    const stats = sim.ctx.log.stats()
    expect(stats.byType['person.born']).toBeGreaterThan(0) // generation + births
    expect(sim.ctx.log.countOf('person.died')).toBeGreaterThan(0) // 10y must see deaths
    expect(sim.ctx.metrics.gaugeValue('population')).toBeGreaterThan(0)
    expect(sim.ctx.clock.tick).toBe(10 * TICKS_PER_YEAR)
  })
})
