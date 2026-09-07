import { describe, it, expect } from 'vitest'
import { checkInvariants, InvariantViolation, Simulation } from '@genesis/simulation'

function makeWorld() {
  return Simulation.create({ seed: 42, populationTarget: 100, years: 1 })
}

describe('invariant suite (GEN-132 / guide §27)', () => {
  it('passes on a healthy world', () => {
    const sim = makeWorld()
    expect(() => checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)).not.toThrow()
  })

  it('catches non-finite wealth with full context', () => {
    const sim = makeWorld()
    const victim = sim.ctx.world.persons[0] as NonNullable<(typeof sim.ctx.world.persons)[number]>
    victim.economy.wealthCents = Number.NaN
    try {
      checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(InvariantViolation)
      const err = e as InvariantViolation
      expect(err.details.invariant).toBe('wealth-finite-integer')
      expect(err.details.entityIds).toContain(victim.id)
      expect(err.details.seed).toBe(sim.ctx.world.seed)
      expect(err.message).toMatch(/invariant=wealth-finite-integer/)
    }
  })

  it('catches non-integer (float) wealth — money rule §4.5', () => {
    const sim = makeWorld()
    const victim = sim.ctx.world.persons[1] as NonNullable<(typeof sim.ctx.world.persons)[number]>
    victim.economy.wealthCents = 10.5
    expect(() => checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)).toThrow(InvariantViolation)
  })

  it('catches dead-but-employed persons', () => {
    const sim = makeWorld()
    const victim = sim.ctx.world.persons.find((p) => p.economy.employerId !== null)
    if (victim === undefined) throw new Error('fixture expected at least one employed person')
    victim.alive = false
    victim.deathTick = 0
    try {
      checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as InvariantViolation).details.invariant).toBe('dead-not-employed')
    }
  })

  it('catches psychology values leaving their domain', () => {
    const sim = makeWorld()
    const victim = sim.ctx.world.persons[2] as NonNullable<(typeof sim.ctx.world.persons)[number]>
    victim.psychology.stress = 1.5
    expect(() => checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)).toThrow(/psychology-values-in-domain/)
  })

  it('catches broken partnership references (Wave 3 schema)', () => {
    const sim = makeWorld()
    const married = sim.ctx.world.persons.find((p) => p.maritalStatus === 'married' && p.partnerId !== null)
    if (married === undefined) throw new Error('fixture expected at least one married couple')
    married.partnerId = 'person-999999'
    expect(() => checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)).toThrow(/partner-exists/)
  })

  it('catches asymmetric partnership', () => {
    const sim = makeWorld()
    const married = sim.ctx.world.persons.find((p) => p.maritalStatus === 'married' && p.partnerId !== null)
    if (married === undefined) throw new Error('fixture expected at least one married couple')
    const partner = sim.ctx.world.persons.find((p) => p.id === married!.partnerId)
    if (partner === undefined) throw new Error('partner must exist')
    partner.partnerId = null
    partner.maritalStatus = 'single'
    expect(() => checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)).toThrow(/partner-mutual/)
  })

  it('catches married-without-partner state', () => {
    const sim = makeWorld()
    const married = sim.ctx.world.persons.find((p) => p.maritalStatus === 'married' && p.partnerId !== null)
    if (married === undefined) throw new Error('fixture expected at least one married couple')
    married.partnerId = null
    expect(() => checkInvariants(sim.ctx.world, 0, sim.ctx.world.seed)).toThrow(/married-has-partner/)
  })
})
