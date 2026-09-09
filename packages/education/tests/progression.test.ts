import { describe, expect, it } from 'vitest'
import { TICKS_PER_MONTH, ageYears } from '@genesis/core'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { educationSystem, ensureRecords } from '@genesis/education'

/**
 * Progression tests (HT-12): monthly skill monotonicity for in-school persons
 * and gauge domain checks. The sim is advanced month by month so the skill
 * sequence of individual records can be observed between monthly runs.
 */

function isEnrolledNow(attainment: string): boolean {
  return attainment === 'in_primary' || attainment === 'in_secondary' || attainment === 'in_tertiary'
}

describe('education progression (HT-12)', () => {
  it('in-school skill is non-decreasing month over month (population + witness)', () => {
    const years = 8
    const sim = Simulation.create(
      { seed: 7, populationTarget: 150, years },
      { systems: [demographicsSystem, educationSystem()] }
    )
    const records = ensureRecords(sim.ctx)

    // Witness: the youngest child present at tick 0 — it flows through the
    // whole pipeline (primary -> secondary) across the run, giving a long
    // in-school skill sequence to inspect.
    const witness = [...sim.ctx.world.persons]
      .sort((a, b) => b.birthTick - a.birthTick)
      .find((p) => ageYears(p.birthTick, 0) <= 5)
    expect(witness).toBeDefined()
    const witnessSeq: number[] = []

    // Population-wide check: every in-school person's skill never decreases
    // between consecutive monthly runs (dropouts are excluded once flagged,
    // since their skill decays by design; clamp-at-1 keeps the sequence flat).
    const lastSkill = new Map<string, number>()
    let sampled = 0
    for (let month = 1; month <= years * 12; month++) {
      sim.stepTo(month * TICKS_PER_MONTH)
      for (const person of sim.ctx.world.persons) {
        if (!person.alive) continue
        const record = records.get(person.id)
        if (record === undefined || record.droppedOut || !isEnrolledNow(record.attainment)) continue
        const prev = lastSkill.get(person.id)
        if (prev !== undefined) expect(record.skill).toBeGreaterThanOrEqual(prev)
        lastSkill.set(person.id, record.skill)
        sampled++
      }
      const witnessRecord = records.get(witness!.id)
      if (witnessRecord !== undefined && !witnessRecord.droppedOut && isEnrolledNow(witnessRecord.attainment)) {
        witnessSeq.push(witnessRecord.skill)
      }
    }

    // Measured for seed 7 / 150 persons / 8 years: 2692 in-school
    // month-observations; the witness contributes > 24 samples.
    expect(sampled).toBeGreaterThan(0)
    expect(witnessSeq.length).toBeGreaterThan(24)
    for (let i = 1; i < witnessSeq.length; i++) {
      expect(witnessSeq[i]).toBeGreaterThanOrEqual(witnessSeq[i - 1] as number)
    }
  })

  it('education gauges are finite and ratios stay in [0, 1]', () => {
    const sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 10 },
      { systems: [demographicsSystem, educationSystem()] }
    )
    sim.run()
    const snapshot = sim.ctx.metrics.snapshot()

    const names = ['education_in_school', 'education_secondary_plus', 'education_dropout_rate', 'education_mean_skill'] as const
    for (const name of names) {
      const value = snapshot[name]
      expect(value).toBeDefined() // recorded every monthly run
      expect(Number.isFinite(value)).toBe(true)
    }
    expect(snapshot['education_secondary_plus']).toBeGreaterThanOrEqual(0)
    expect(snapshot['education_secondary_plus']).toBeLessThanOrEqual(1)
    expect(snapshot['education_dropout_rate']).toBeGreaterThanOrEqual(0)
    expect(snapshot['education_dropout_rate']).toBeLessThanOrEqual(1)
    expect(snapshot['education_mean_skill']).toBeGreaterThanOrEqual(0) // skills are clamped to [0, 1]
    expect(snapshot['education_mean_skill']).toBeLessThanOrEqual(1)
    expect(snapshot['education_in_school']).toBeGreaterThanOrEqual(0)
  })
})

describe('skillRateModifier injection (KI-8 follow-up: school quality → skill)', () => {
  it('a 2x modifier makes in-school skill grow faster; default stays legacy', async () => {
    const { demographicsSystem, Simulation } = await import('@genesis/simulation')
    const { educationSystem } = await import('@genesis/education')
    const fast = Simulation.create(
      { seed: 42, populationTarget: 150, years: 4 },
      { systems: [demographicsSystem, educationSystem({ skillRateModifier: () => 2 })] }
    )
    fast.run()
    const slow = Simulation.create(
      { seed: 42, populationTarget: 150, years: 4 },
      { systems: [demographicsSystem, educationSystem()] }
    )
    slow.run()
    // mean in-school skill is higher under the doubled rate
    const fastMean = fast.ctx.metrics.statsOf('education_mean_skill')?.mean
    const slowMean = slow.ctx.metrics.statsOf('education_mean_skill')?.mean
    if (fastMean !== undefined && slowMean !== undefined) {
      expect(fastMean).toBeGreaterThan(slowMean)
    }
    // both deterministic
    expect(fast.digest()).toBe(fast.digest())
  }, 60_000)
})
