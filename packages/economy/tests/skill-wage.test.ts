import { describe, it, expect } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { EconomyDeps, economySystems } from '@genesis/economy'

/**
 * Skill wage pricing at hire time (HT-12 / GEN-151b): the injected
 * EconomyDeps.wageSkillMultiplier callback is applied exactly once, when a
 * job-search hire happens — employer.monthlyIncomeCents stays the single
 * standard wage, while person.economy.monthlyIncomeCents (and the new
 * job.started payload field incomeCents) carry the priced pay.
 *
 * Defaults are byte-compatible: without deps every hire pays the plain
 * employer wage, exactly as before HT-12.
 */

interface HireRecord {
  personId: string
  employerId: string
  wageCents: number
  incomeCents: number
}

/**
 * Run a world and collect post-generation hires ('job.started' at tick > 0;
 * tick 0 belongs to the population generator, which does not use EconomyDeps).
 * `onHire` runs synchronously at emit time, so person state is event-time.
 */
function collectHires(
  config: { seed: number; populationTarget: number; years: number },
  deps?: EconomyDeps,
  onHire?: (hire: HireRecord, incomeNow: number) => void,
  wire?: (sim: Simulation) => void
): { sim: Simulation; hires: HireRecord[] } {
  const sim = Simulation.create(config, { systems: [demographicsSystem, ...economySystems(deps)] })
  const hires: HireRecord[] = []
  sim.ctx.events.onAny((event) => {
    if (event.tick === 0) return
    if (event.type !== 'job.started') return
    const payload = event.payload as { wageCents: number; incomeCents: number }
    const hire: HireRecord = {
      personId: event.actorIds[0],
      employerId: event.actorIds[1],
      wageCents: payload.wageCents,
      incomeCents: payload.incomeCents
    }
    hires.push(hire)
    if (onHire === undefined) return
    const person = sim.ctx.world.persons.find((p) => p.id === hire.personId)
    if (person === undefined) throw new Error(`hired person ${hire.personId} missing from world`)
    onHire(hire, person.economy.monthlyIncomeCents)
  })
  if (wire !== undefined) wire(sim)
  sim.run()
  return { sim, hires }
}

/** Assert every resident still at their last post-generation job is paid the
 * expected multiple of that employer's standard wage. */
function verifyStillEmployed(sim: Simulation, hires: HireRecord[], factor: number): number {
  const employerById = new Map(sim.ctx.world.employers.map((e) => [e.id, e]))
  const lastHire = new Map<string, HireRecord>()
  for (const hire of hires) lastHire.set(hire.personId, hire)
  let verified = 0
  for (const person of sim.ctx.world.persons) {
    if (!person.alive || person.economy.employerId === null) continue
    const hire = lastHire.get(person.id)
    if (hire === undefined) continue // generator-assigned job at tick 0
    if (person.economy.employerId !== hire.employerId) continue // changed jobs later
    const employer = employerById.get(person.economy.employerId)
    if (employer === undefined) throw new Error(`employer ${person.economy.employerId} missing from world`)
    expect(person.economy.monthlyIncomeCents).toBe(factor * employer.monthlyWageCents)
    verified++
  }
  return verified
}

describe('skill wage pricing at hire (HT-12)', () => {
  const CONFIG = { seed: 42, populationTarget: 200, years: 3 } as const

  it('a constant 2.0 multiplier doubles every new hire income and lands in the payload', () => {
    let eventTimeChecks = 0
    const { sim, hires } = collectHires(
      CONFIG,
      { wageSkillMultiplier: () => 2.0 },
      (hire, incomeNow) => {
        expect(hire.incomeCents).toBe(hire.wageCents * 2)
        expect(incomeNow).toBe(hire.incomeCents) // person priced at emit time
        eventTimeChecks++
      },
      // money conservation under injection: the priced income must still flow
      // through payroll/consumption without creating or destroying cents
      (sim) => {
        let incomeSum = 0
        let consumptionSum = 0
        sim.ctx.events.onAny((event) => {
          const payload = event.payload as { amountCents?: number } | undefined
          if (event.type === 'income.received' && payload?.amountCents !== undefined) incomeSum += payload.amountCents
          else if (event.type === 'pension.paid' && payload?.amountCents !== undefined) incomeSum += payload.amountCents
          else if (event.type === 'consumption.paid' && payload?.amountCents !== undefined) consumptionSum += payload.amountCents
        })
        const before = sim.ctx.world.persons.reduce((sum, p) => sum + p.economy.wealthCents, 0)
        sim.ctx.extensions.set('test.accounting', { before, incomeRef: () => incomeSum, consumptionRef: () => consumptionSum })
      }
    )

    expect(hires.length).toBeGreaterThan(0)
    expect(eventTimeChecks).toBe(hires.length)

    const accounting = sim.ctx.extensions.get('test.accounting') as {
      before: number
      incomeRef: () => number
      consumptionRef: () => number
    }
    const after = sim.ctx.world.persons.reduce((sum, p) => sum + p.economy.wealthCents, 0)
    expect(accounting.incomeRef() - accounting.consumptionRef()).toBe(after - accounting.before)

    expect(verifyStillEmployed(sim, hires, 2)).toBeGreaterThan(0)
  }, 60_000)

  it('a callback returning 3.0 is defensively clamped to 2.0', () => {
    const { hires } = collectHires(
      { seed: 7, populationTarget: 100, years: 2 },
      { wageSkillMultiplier: () => 3.0 },
      (hire) => {
        expect(hire.incomeCents).toBe(hire.wageCents * 2) // clamped, NOT 3x
      }
    )
    expect(hires.length).toBeGreaterThan(0)
  }, 60_000)

  it('without deps the priced income equals the employer wage (legacy behavior)', () => {
    const { sim, hires } = collectHires(CONFIG, undefined, (hire, incomeNow) => {
      expect(hire.incomeCents).toBe(hire.wageCents)
      expect(incomeNow).toBe(hire.wageCents)
    })
    expect(hires.length).toBeGreaterThan(0)
    expect(verifyStillEmployed(sim, hires, 1)).toBeGreaterThan(0)
  }, 60_000)
})

describe('determinism with injected skill multiplier', () => {
  const CONFIG = { seed: 42, populationTarget: 60, years: 2 } as const
  const deps: EconomyDeps = { wageSkillMultiplier: () => 1.5 }

  it('same seed + same injected deps ⇒ identical digest across independent runs', () => {
    const a = Simulation.create(CONFIG, { systems: [demographicsSystem, ...economySystems(deps)] })
    a.run()
    const b = Simulation.create(CONFIG, { systems: [demographicsSystem, ...economySystems(deps)] })
    b.run()
    expect(a.digest()).toBe(b.digest())
  }, 90_000)

  it('the injection actually changes the outcome (not a silent no-op)', () => {
    const plain = Simulation.create(CONFIG, { systems: [demographicsSystem, ...economySystems()] })
    plain.run()
    const boosted = Simulation.create(CONFIG, { systems: [demographicsSystem, ...economySystems(deps)] })
    boosted.run()
    expect(plain.digest()).not.toBe(boosted.digest())
  }, 90_000)
})
