import { describe, expect, it } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { digest, stableStringify } from '@genesis/shared'
import { attainmentOf, educationSystem, ensureRecords, skillOf } from '@genesis/education'

/**
 * Determinism tests (HT-12).
 *
 * IMPORTANT (side-table design cost, see src/types.ts): education state lives
 * in ctx.extensions and is NOT part of Simulation.digest() — the replay digest
 * only covers canonical schema data. Same-seed replay equality of the
 * education state is therefore guaranteed by the same determinism that drives
 * the digest (forked RNG + fixed iteration order) and verified here by an
 * INDEPENDENT assertion over a canonically serialized snapshot of the records
 * map (sorted by personId, skill rounded like the engine's digest).
 */

function runWorld(seed: number | string, persons: number, years: number): Simulation {
  const sim = Simulation.create(
    { seed, populationTarget: persons, years },
    { systems: [demographicsSystem, educationSystem()] }
  )
  sim.run()
  return sim
}

/** Deterministic digest of the education side table (sorted keys, rounded skill). */
function recordsDigest(sim: Simulation): string {
  const rows = [...ensureRecords(sim.ctx).values()].map((record) => ({
    id: record.personId,
    attainment: record.attainment,
    droppedOut: record.droppedOut,
    skill: Number(record.skill.toFixed(6))
  }))
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return digest(stableStringify(rows))
}

describe('education determinism (HT-12)', () => {
  it('same seed => identical world digest AND identical education side table', () => {
    const run = (seed: number | string) => ({
      world: runWorld(seed, 120, 5).digest(),
      education: recordsDigest(runWorld(seed, 120, 5))
    })

    const numeric = run(42)
    expect(numeric.world).toBe(run(42).world)
    // 教育状态不在 replay digest 内，其确定性由本独立断言保障。
    expect(numeric.education).toBe(run(42).education)

    const stringSeed = run('genesis-education')
    expect(stringSeed.education).toBe(run('genesis-education').education)
  })

  it('invariants stay green for the whole run (education never touches schema)', () => {
    // checkInvariants defaults to true: the built-in monthly invariant system
    // throws InvariantViolation on any violation, and run() re-checks at the
    // end — reaching these lines means every monthly check passed.
    const sim = runWorld(2026, 120, 5)
    expect(sim.ctx.metrics.gaugeValue('invariant_checks_last')).toBeGreaterThan(0)
  })

  it('read accessors: skillOf/attainmentOf behave for tracked and unknown ids', () => {
    const sim = runWorld(2026, 120, 5)
    const tracked = sim.ctx.world.persons.find((p) => p.alive)
    expect(tracked).toBeDefined()
    // With the bootstrap rule everyone aged 6+ carries a record after run().
    expect(attainmentOf(sim.ctx, tracked!.id)).not.toBe('none')
    expect(skillOf(sim.ctx, tracked!.id)).toBeGreaterThanOrEqual(0)
    expect(skillOf(sim.ctx, tracked!.id)).toBeLessThanOrEqual(1)

    expect(skillOf(sim.ctx, 'no-such-person')).toBe(0)
    expect(attainmentOf(sim.ctx, 'no-such-person')).toBe('none')
  })
})
