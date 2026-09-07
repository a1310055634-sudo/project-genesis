import { ageYears } from '@genesis/core'
import { GenesisSystem, nextMonthStart, SimContext } from './context'
import { createPerson } from './factory'
import { Household, Person } from './types'

/**
 * Demography (GEN-021/023/025): aging via birthTick, monthly mortality and
 * birth. Mortality is a simplified synthetic hazard curve — a computational
 * abstraction, NOT a calibrated actuarial table.
 *
 * hazard(month) = 0.0002 + max(0, age - 60) * 0.0009  (clamped to [0, 0.5])
 */
export function monthlyDeathHazard(age: number): number {
  const hazard = 0.0002 + Math.max(0, age - 60) * 0.0009
  return Math.min(0.5, hazard)
}

function eligibleBirthHouseholds(ctx: SimContext, personById: Map<string, Person>): Household[] {
  const out: Household[] = []
  for (const household of ctx.world.households) {
    const alive = household.memberIds.map((id) => personById.get(id)).filter((p): p is Person => p !== undefined && p.alive)
    const male = alive.find((p) => p.sex === 'male')
    const female = alive.find((p) => p.sex === 'female')
    if (male === undefined || female === undefined) continue
    // births require a MARRIED couple (red team RT1-01: cohabiting non-spouses
    // must not produce children), mutually linked via partnerId. Household
    // size is NOT constrained to 2 (couples with children can breed again).
    if (male.maritalStatus !== 'married' || female.maritalStatus !== 'married') continue
    if (male.partnerId !== female.id || female.partnerId !== male.id) continue
    const ageF = ageYears(female.birthTick, ctx.tick())
    if (ageF < 18 || ageF > 45) continue
    out.push(household)
  }
  return out
}

export const demographicsSystem: GenesisSystem = {
  id: 'demographics',
  priority: 10,
  nextFireTick: nextMonthStart,
  run(ctx: SimContext) {
    const tick = ctx.tick()
    const rng = ctx.rng.fork(`demographics:${tick}`)

    // 1) life-stage refresh (aging is implicit in birthTick)
    for (const person of ctx.world.persons) {
      if (!person.alive) continue
      const age = ageYears(person.birthTick, tick)
      const stage = age < 18 ? 'child' : age < 65 ? 'adult' : 'senior'
      if (person.lifeStage !== stage) {
        person.lifeStage = stage
        ctx.events.emit({ id: ctx.ids.next('event'), type: 'person.aged', tick, actorIds: [person.id], payload: { age, stage } })
      }
    }

    // 2) mortality
    const personById = new Map(ctx.world.persons.map((p) => [p.id, p]))
    for (const person of ctx.world.persons) {
      if (!person.alive) continue
      const age = ageYears(person.birthTick, tick)
      if (rng.bool(monthlyDeathHazard(age))) {
        person.alive = false
        person.deathTick = tick
        // widowhood at death time (red team RT1-02): partnership must stay mutual
        if (person.partnerId !== null) {
          const partner = personById.get(person.partnerId)
          if (partner !== undefined && partner.alive) {
            partner.partnerId = null
            partner.maritalStatus = 'widowed'
          }
          ctx.events.emit({
            id: ctx.ids.next('event'),
            type: 'relationship.ended',
            tick,
            actorIds: [person.id],
            payload: { reason: 'widowhood' }
          })
          person.partnerId = null
          person.maritalStatus = 'widowed'
        }
        // release job slot
        if (person.economy.employerId !== null) {
          const employer = ctx.world.employers.find((e) => e.id === person.economy.employerId)
          if (employer !== undefined) employer.filledSlots = Math.max(0, employer.filledSlots - 1)
          ctx.events.emit({ id: ctx.ids.next('event'), type: 'job.ended', tick, actorIds: [person.id], payload: { reason: 'death' } })
          person.economy.employerId = null
          person.economy.monthlyIncomeCents = 0
        }
        // leave household
        if (person.householdId !== null) {
          const household = ctx.world.households.find((h) => h.id === person.householdId)
          if (household !== undefined) {
            household.memberIds = household.memberIds.filter((id) => id !== person.id)
          }
          person.householdId = null
        }
        ctx.events.emit({ id: ctx.ids.next('event'), type: 'person.died', tick, actorIds: [person.id], payload: { age } })
      }
    }

    // 3) births (married couples only; newborns carry the parenthood chain)
    const eligible = eligibleBirthHouseholds(ctx, personById)
    for (const household of eligible) {
      if (rng.bool(ctx.config.birthProbabilityPerMonth)) {
        const members = household.memberIds.map((id) => personById.get(id)).filter((p): p is Person => p !== undefined)
        const mother = members.find((p) => p.sex === 'female')
        const father = members.find((p) => p.sex === 'male')
        const newborn = createPerson(ctx, undefined, {
          birthTick: tick,
          parents: { motherId: mother?.id ?? null, fatherId: father?.id ?? null }
        })
        household.memberIds.push(newborn.id)
        newborn.householdId = household.id
      }
    }

    ctx.metrics.gauge('population', ctx.world.persons.filter((p) => p.alive).length)
    ctx.metrics.increment('demographics.months_processed')
  }
}
