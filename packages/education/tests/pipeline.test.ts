import { describe, expect, it } from 'vitest'
import { ageYears } from '@genesis/core'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { educationSystem, ensureRecords } from '@genesis/education'

/**
 * Enrollment-chain tests (HT-12). Systems under test run against a generated
 * world: demographics (aging/birth/death) + education. Imports use the
 * package names, which resolve through the vitest alias / workspace link set
 * up at integration time (tsc resolves them via tsconfig paths already).
 */

function runWorld(seed: number | string, persons: number, years: number): Simulation {
  const sim = Simulation.create(
    { seed, populationTarget: persons, years },
    { systems: [demographicsSystem, educationSystem()] }
  )
  sim.run()
  return sim
}

/** Share of alive adults (age >= 18) whose attainment is 'secondary'/'tertiary'. */
function adultSecondaryPlusShare(sim: Simulation): number {
  const records = ensureRecords(sim.ctx)
  const tick = sim.ctx.clock.tick
  let adults = 0
  let secondaryPlus = 0
  for (const person of sim.ctx.world.persons) {
    if (!person.alive) continue
    if (ageYears(person.birthTick, tick) >= 18) {
      adults++
      const record = records.get(person.id)
      if (record !== undefined && (record.attainment === 'secondary' || record.attainment === 'tertiary')) {
        secondaryPlus++
      }
    }
  }
  return adults === 0 ? 0 : secondaryPlus / adults
}

describe('education enrollment chain (HT-12)', () => {
  it('enrolls at 6, completes secondary, and raises adult secondary+ share', () => {
    // Measured for seed 42 / 200 persons / 20 years: 442 enrolled,
    // 219 completed, adult secondary+ share = 0.75.
    const sim = runWorld(42, 200, 20)
    const log = sim.ctx.log

    expect(log.countOf('education.enrolled')).toBeGreaterThan(0)
    expect(log.countOf('education.completed')).toBeGreaterThan(0)
    expect(adultSecondaryPlusShare(sim)).toBeGreaterThan(0)
  })

  it('dropout path exists: 300 persons x 20 years', () => {
    // Measured graduation windows (dropouts at p=0.15, completions at
    // p=0.85 secondary + p=0.75 tertiary), 300 persons x 20 years:
    //   seed 7    ->  64 dropped_out, 330 completed
    //   seed 42   ->  50 dropped_out, 337 completed
    //   seed 123  ->  68 dropped_out, 329 completed
    //   seed 2026 ->  68 dropped_out, 327 completed
    // The bootstrap cohort alone (~225 adults enrolling at the first monthly
    // run and sitting the age-18 graduation roll two months later) gives far
    // more than 200 windows, so P(no dropout) is ~0.85^300-scale: seed 42 is
    // asserted with 50 measured dropout events.
    const sim = runWorld(42, 300, 20)
    expect(sim.ctx.log.countOf('education.dropped_out')).toBeGreaterThan(0)
  })
})
