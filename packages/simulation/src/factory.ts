import { Rng, ageYears } from '@genesis/core'
import { SimContext } from './context'
import { EconomyState, Employer, Household, LifeStage, Personality, Person, PsychologyState, Sex, SocialState, lifeStageFor } from './types'

/**
 * Person factory (GEN-022). Trait/state generators are injectable so domain
 * packages can replace the neutral defaults without upward imports.
 */
export interface PersonInitializers {
  personality?(rng: Rng): Personality
  psychology?(rng: Rng): PsychologyState
  economy?(rng: Rng): EconomyState
  social?(rng: Rng): SocialState
}

export function defaultPersonality(rng: Rng): Personality {
  return {
    openness: rng.next(),
    conscientiousness: rng.next(),
    extraversion: rng.next(),
    agreeableness: rng.next(),
    neuroticism: rng.next()
  }
}

export function defaultPsychology(rng: Rng): PsychologyState {
  return {
    affectValence: (rng.next() - 0.5) * 0.4,
    affectArousal: 0.2 + rng.next() * 0.3,
    stress: 0.1 + rng.next() * 0.2,
    needRest: 0.5 + rng.next() * 0.4,
    needSocial: 0.4 + rng.next() * 0.5,
    needEsteem: 0.4 + rng.next() * 0.5,
    wellbeing: 0.5 + (rng.next() - 0.5) * 0.2
  }
}

export function defaultEconomy(): EconomyState {
  return { employerId: null, monthlyIncomeCents: 0, wealthCents: 0, lastMonthConsumptionCents: 0 }
}

export function defaultSocial(): SocialState {
  return { relationshipIds: [] }
}

export function createPerson(
  ctx: SimContext,
  init: PersonInitializers | undefined,
  opts: { sex?: Sex; birthTick: number }
): Person {
  const rng = ctx.rng.fork(`person:${ctx.ids.issued('person') + 1}`)
  const sex: Sex = opts.sex ?? (rng.bool(0.5) ? 'male' : 'female')
  const personality = init?.personality ? init.personality(rng) : defaultPersonality(rng)
  const psychology = init?.psychology ? init.psychology(rng) : defaultPsychology(rng)
  const economy = init?.economy ? init.economy(rng) : defaultEconomy()
  const social = init?.social ? init.social(rng) : defaultSocial()
  const age = ageYears(opts.birthTick, ctx.tick())
  const person: Person = {
    id: ctx.ids.next('person'),
    sex,
    birthTick: opts.birthTick,
    alive: true,
    deathTick: null,
    lifeStage: lifeStageFor(age) as LifeStage,
    householdId: null,
    personality,
    psychology,
    economy,
    social
  }
  ctx.world.persons.push(person)
  ctx.events.emit({ id: ctx.ids.next('event'), type: 'person.born', tick: ctx.tick(), actorIds: [person.id] })
  return person
}

export function createHousehold(ctx: SimContext, memberIds: string[]): Household {
  const household: Household = { id: ctx.ids.next('household'), memberIds: [...memberIds] }
  ctx.world.households.push(household)
  for (const memberId of memberIds) {
    const person = ctx.world.persons.find((p) => p.id === memberId)
    if (!person) throw new Error(`household ${household.id}: unknown member ${memberId}`)
    person.householdId = household.id
  }
  ctx.events.emit({
    id: ctx.ids.next('event'),
    type: 'household.created',
    tick: ctx.tick(),
    actorIds: memberIds,
    payload: { householdId: household.id }
  })
  return household
}

export function createEmployer(ctx: SimContext, name: string, jobSlots: number, monthlyWageCents: number): Employer {
  const employer: Employer = {
    id: ctx.ids.next('employer'),
    name,
    jobSlots,
    filledSlots: 0,
    monthlyWageCents
  }
  ctx.world.employers.push(employer)
  ctx.events.emit({
    id: ctx.ids.next('event'),
    type: 'company.created',
    tick: ctx.tick(),
    actorIds: [employer.id],
    payload: { name, jobSlots }
  })
  return employer
}
