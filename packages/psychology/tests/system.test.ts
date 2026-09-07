import { describe, it, expect } from 'vitest'
import { Simulation } from '@genesis/simulation'
import { psychologySystem, PsychEnvironment } from '@genesis/psychology'
import { inRange } from './helpers'

const ENV: PsychEnvironment = {
  financialStrain: 0.25,
  occupationalStrain: 0.35,
  relationshipConflict: 0.2,
  socialSupport: 0.5,
  adverseEvents: 0.05
}

describe('psychologySystem (SimContext integration)', () => {
  it('updates persons daily and records monthly metric gauges', () => {
    const sim = Simulation.create({ seed: 123, populationTarget: 80, years: 1 }, { systems: [psychologySystem(() => ENV)] })
    sim.run()

    const stress = sim.ctx.metrics.statsOf('stress')
    const wellbeing = sim.ctx.metrics.statsOf('wellbeing')
    const affect = sim.ctx.metrics.statsOf('affect')
    expect(stress).not.toBeNull()
    expect(wellbeing).not.toBeNull()
    expect(affect).not.toBeNull()
    // stepTo(8640) fires day boundaries 24..8616 => 359 daily runs,
    // of which ticks 720..7920 (11 boundaries) are month starts
    expect(stress!.count).toBeGreaterThanOrEqual(11 * 80)
    expect(inRange(stress!.mean, 0, 1)).toBe(true)
    expect(inRange(wellbeing!.mean, 0, 1)).toBe(true)
    expect(inRange(affect!.mean, -1, 1)).toBe(true)

    const daysProcessed = sim.ctx.metrics.counterValue('psychology.days_processed')
    // 360 days in 1 year — endpoint tick fires since RT1-03 fix
    expect(daysProcessed).toBe(360)
    for (const p of sim.ctx.world.persons) {
      expect(inRange(p.psychology.stress, 0, 1)).toBe(true)
      expect(inRange(p.psychology.wellbeing, 0, 1)).toBe(true)
      expect(inRange(p.psychology.affectValence, -1, 1)).toBe(true)
    }
  })

  it('is replay-stable under a fixed seed', () => {
    const a = Simulation.create({ seed: 777, populationTarget: 60, years: 1 }, { systems: [psychologySystem(() => ENV)] })
    const b = Simulation.create({ seed: 777, populationTarget: 60, years: 1 }, { systems: [psychologySystem(() => ENV)] })
    a.run()
    b.run()
    expect(a.digest()).toBe(b.digest())
  })
})
