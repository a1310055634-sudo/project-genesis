import { ageYears } from '@genesis/core'
import { GenesisSystem, nextMonthStart, SimContext } from './context'
import { recordCohortMetrics } from './cohort'
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

/**
 * Birth eligibility (red team RT2-06): enumerate every MARRIED opposite-sex
 * pair in the household explicitly — never "first male × first female find",
 * which would silently mis-attribute parents the day a household hosts more
 * than one adult pair. Household size is unconstrained.
 */
interface EligibleBirth {
  household: Household
  father: Person
  mother: Person
}

function eligibleBirthHouseholds(ctx: SimContext, personById: Map<string, Person>): EligibleBirth[] {
  const out: EligibleBirth[] = []
  for (const household of ctx.world.households) {
    const alive = household.memberIds.map((id) => personById.get(id)).filter((p): p is Person => p !== undefined && p.alive)
    const males = alive.filter((p) => p.sex === 'male')
    const females = alive.filter((p) => p.sex === 'female')
    for (const father of males) {
      for (const mother of females) {
        // births require a MARRIED couple (red team RT1-01: cohabiting
        // non-spouses must not produce children), mutually linked via partnerId
        if (father.maritalStatus !== 'married' || mother.maritalStatus !== 'married') continue
        if (father.partnerId !== mother.id || mother.partnerId !== father.id) continue
        const ageF = ageYears(mother.birthTick, ctx.tick())
        if (ageF < 18 || ageF > 45) continue
        out.push({ household, father, mother })
      }
    }
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
        // widowhood at death time (red team RT1-02), with a death-time spouse
        // SNAPSHOT (red team RT2-01): the family system resolves inheritance
        // from spouseAtDeathId, so system ordering never matters.
        if (person.partnerId !== null) {
          person.spouseAtDeathId = person.partnerId
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
    for (const { household, father, mother } of eligible) {
      if (rng.bool(ctx.config.birthProbabilityPerMonth)) {
        // parents come from the vetted married pair (RT2-06), never from find
        const newborn = createPerson(ctx, undefined, {
          birthTick: tick,
          parents: { motherId: mother.id, fatherId: father.id }
        })
        household.memberIds.push(newborn.id)
        newborn.householdId = household.id
      }
    }

    ctx.metrics.gauge('population', ctx.world.persons.filter((p) => p.alive).length)
    // Roadmap A4: birth-cohort gauges (per-decade alive/wealth/employment),
    // stamped after births so the month's newborns land in their cohort
    recordCohortMetrics(ctx)
    ctx.metrics.increment('demographics.months_processed')
  }
}
