import { describe, it, expect } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'

/**
 * Replay determinism (GEN-011): the economy systems draw randomness only from
 * the forked ctx RNG streams, so the same seed + config must yield identical
 * run digests (world snapshot + metrics + event stats).
 */

const CONFIG = { seed: 42, populationTarget: 200, years: 3 } as const

describe('deterministic economy replay', () => {
  it('same seed + config ⇒ identical digest across independent runs', () => {
    const a = Simulation.create(CONFIG, { systems: [demographicsSystem, ...economySystems()] })
    a.run()
    const b = Simulation.create(CONFIG, { systems: [demographicsSystem, ...economySystems()] })
    b.run()
    expect(a.digest()).toBe(b.digest())
  }, 90_000)

  it('different seed ⇒ different digest', () => {
    const a = Simulation.create({ ...CONFIG, seed: 42 }, { systems: [demographicsSystem, ...economySystems()] })
    a.run()
    const b = Simulation.create({ ...CONFIG, seed: 7 }, { systems: [demographicsSystem, ...economySystems()] })
    b.run()
    expect(a.digest()).not.toBe(b.digest())
  }, 90_000)
})
