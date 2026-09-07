import { describe, it, expect } from 'vitest'
import { TICKS_PER_YEAR } from '@genesis/core'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { economySystems } from '@genesis/economy'

/**
 * Labor-market tests: hires and separations actually happen, employer slot
 * bookkeeping stays consistent (also verified monthly by the built-in
 * invariant system — any violation would throw InvariantViolation mid-run),
 * and employed seniors retire.
 */

const MARKET_CONFIG = { seed: 42, populationTarget: 200, years: 3 } as const

describe('labor market dynamics', () => {
  it('records both hires and separations during the run', () => {
    const sim = Simulation.create(MARKET_CONFIG, { systems: [demographicsSystem, ...economySystems()] })
    // count only post-generation events (tick 0 = population generator)
    let startedAfterGen = 0
    let endedAfterGen = 0
    sim.ctx.events.onAny((event) => {
      if (event.tick === 0) return
      if (event.type === 'job.started') startedAfterGen++
      else if (event.type === 'job.ended') endedAfterGen++
    })
    sim.run()
    expect(startedAfterGen).toBeGreaterThan(0)
    expect(endedAfterGen).toBeGreaterThan(0)
  }, 60_000)

  it('keeps employer references consistent for all alive employed residents', () => {
    const sim = Simulation.create(MARKET_CONFIG, { systems: [demographicsSystem, ...economySystems()] })
    sim.run()

    const employerById = new Map(sim.ctx.world.employers.map((e) => [e.id, e]))
    const referenceCounts = new Map<string, number>()
    for (const person of sim.ctx.world.persons) {
      if (!person.alive || person.economy.employerId === null) continue
      const employer = employerById.get(person.economy.employerId)
      expect(employer).toBeDefined()
      expect(person.economy.monthlyIncomeCents).toBe((employer as { monthlyWageCents: number }).monthlyWageCents)
      referenceCounts.set(person.economy.employerId, (referenceCounts.get(person.economy.employerId) ?? 0) + 1)
    }
    for (const [employerId, count] of referenceCounts) {
      expect((employerById.get(employerId) as { filledSlots: number }).filledSlots).toBe(count)
    }
  }, 60_000)
})

describe('retirement', () => {
  it('employed residents aged 65+ leave their jobs over time', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 60, years: 2 },
      { systems: [demographicsSystem, ...economySystems()] }
    )
    // Accelerate aging: shift the whole synthetic cohort to age 70 so every
    // generated job holder is retirement-eligible from month one.
    for (const person of sim.ctx.world.persons) {
      person.birthTick = -70 * TICKS_PER_YEAR
      person.lifeStage = 'senior'
    }

    let retirementEnds = 0
    sim.ctx.events.onAny((event) => {
      const payload = event.payload as { reason?: string } | undefined
      if (event.type === 'job.ended' && payload?.reason === 'retirement') retirementEnds++
    })

    const employedBefore = sim.ctx.world.persons.filter((p) => p.alive && p.economy.employerId !== null).length
    expect(employedBefore).toBeGreaterThan(0)

    sim.run()

    const employedAfter = sim.ctx.world.persons.filter((p) => p.alive && p.economy.employerId !== null).length
    expect(retirementEnds).toBeGreaterThan(0)
    expect(employedAfter).toBeLessThan(employedBefore)
  }, 60_000)
})
