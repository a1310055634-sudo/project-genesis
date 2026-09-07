import { describe, expect, it } from 'vitest'
import { SimulationEvent, TICKS_PER_MONTH } from '@genesis/core'
import { checkInvariants, demographicsSystem } from '@genesis/simulation'
import { familySystem } from '@genesis/family'
import { killLikeDemographics, makeWidowWorld, totalWealth } from './helpers'

const ESTATE_CENTS = 123_456

describe('inheritance (estate -> surviving spouse)', () => {
  it('a dead spouse transfers the whole estate to the widow(er), conserving total wealth', () => {
    const { sim, husband, wife } = makeWidowWorld(42, ESTATE_CENTS)
    const before = totalWealth(sim)
    expect(before).toBe(ESTATE_CENTS)

    // run exactly one monthly boundary (month systems fire at tick 720)
    sim.stepTo(TICKS_PER_MONTH + 1)

    const after = totalWealth(sim)
    expect(husband.economy.wealthCents).toBe(0) // estate zeroed out
    expect(wife.economy.wealthCents).toBe(ESTATE_CENTS) // heir got every cent
    expect(after - before).toBe(0) // world-total wealth conserved exactly

    const inherited = sim.ctx.log
      .recentEvents()
      .filter((e: SimulationEvent) => e.type === 'wealth.inherited')
    expect(inherited.length).toBe(1)
    const event = inherited[0] as SimulationEvent
    expect(event.actorIds).toEqual([husband.id, wife.id])
    expect(event.payload).toMatchObject({ amountCents: ESTATE_CENTS })

    // no estates went unclaimed; the gauge stays untouched
    expect(sim.ctx.metrics.gaugeValue('family.estates_unclaimed_cents')).toBe(0)
  })

  it('an estate without a surviving spouse is unclaimed and auditable', () => {
    const { sim, husband, wife } = makeWidowWorld(42, ESTATE_CENTS)
    // divorce the couple first (no inheritance between ex-spouses), then kill
    // the ex-wife too so no surviving spouse exists at the first family run
    husband.partnerId = null
    wife.partnerId = null
    husband.maritalStatus = 'divorced'
    wife.maritalStatus = 'divorced'
    killLikeDemographics(sim, wife)

    const before = totalWealth(sim)
    sim.stepTo(TICKS_PER_MONTH + 1)

    expect(husband.economy.wealthCents).toBe(0)
    expect(sim.ctx.metrics.gaugeValue('family.estates_unclaimed_cents')).toBe(ESTATE_CENTS)
    expect(sim.ctx.log.countOf('wealth.inherited')).toBe(0)
    // unclaimed money leaves the world total: delta = -(unclaimed sum)
    expect(totalWealth(sim) - before).toBe(-ESTATE_CENTS)
  })
})

describe('widowhood', () => {
  it('the survivor is widowed at death time (demographics) and the family sweep stays an idempotent safety net', () => {
    const { sim, husband, wife } = makeWidowWorld(42, 0) // penniless: inheritance phase is a no-op
    // killLikeDemographics already replicates the death-time widowhood
    // (red team RT2-01 semantics) — the state is correct BEFORE any run
    expect(wife.alive).toBe(true)
    expect(wife.maritalStatus).toBe('widowed')
    expect(wife.partnerId).toBeNull()

    sim.stepTo(TICKS_PER_MONTH + 1)

    // the family sweep is a no-op safety net: nothing regressed, nothing duplicated
    expect(wife.maritalStatus).toBe('widowed')
    expect(wife.partnerId).toBeNull()
    // the deceased's record is closed out too (keeps invariants green)
    expect(husband.partnerId).toBeNull()
    expect(husband.maritalStatus).toBe('widowed')

    const ended = sim.ctx.log
      .recentEvents()
      .filter(
        (e: SimulationEvent) =>
          e.type === 'relationship.ended' &&
          (e.payload as { reason?: string }).reason === 'widowhood' &&
          e.actorIds.includes(husband.id)
      )
    // exactly ONE widowhood event (demographics', actorIds=[deceased]); the
    // safety net must not emit a second one for the same marriage
    expect(ended.length).toBe(1)
    expect(ended[0]!.actorIds).toEqual([husband.id])

    const stats = checkInvariants(sim.ctx.world, sim.ctx.clock.tick, sim.ctx.world.seed)
    expect(stats.violations).toBe(0)
  })
})
