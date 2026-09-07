import { Rng, ageYears } from '@genesis/core'
import { cents } from '@genesis/shared'
import { SimContext } from './context'
import { createEmployer, createHousehold, createPerson, PersonInitializers } from './factory'
import { Employer, Person, Sex } from './types'

/**
 * Population generator (GEN-024). Deterministic under a fixed seed: every draw
 * comes from the forked 'population' RNG stream in fixed iteration order.
 *
 * Demographic shape (simplified, recorded in README): 25% children (0-17),
 * 60% adults (18-64), 15% seniors (65-85).
 */
export function generatePopulation(ctx: SimContext, initializers?: PersonInitializers): void {
  const rng = ctx.rng.fork('population')
  const target = ctx.config.populationTarget

  // 1) persons with age/sex distribution
  for (let i = 0; i < target; i++) {
    const seg = rng.next()
    let age: number
    if (seg < 0.25) age = rng.int(0, 17)
    else if (seg < 0.85) age = rng.int(18, 64)
    else age = rng.int(65, 85)
    const sex: Sex = rng.bool(0.5) ? 'male' : 'female'
    const person = createPerson(ctx, initializers, { sex, birthTick: -age * 8_640 })
    // birthTick negative = existed before sim start; ages stay correct since ageYears uses nowTick
  }

  // 2) couple households among unassigned adults, then singles (queue-based, O(N))
  const persons = ctx.world.persons
  const adults = persons.filter((p) => ageYears(p.birthTick, 0) >= 18)
  const shuffled = rng.shuffle(adults)
  const unassignedMales: Person[] = []
  const unassignedFemales: Person[] = []
  const householdMembers: string[][] = []
  for (const person of shuffled) {
    const partnerQueue = person.sex === 'male' ? unassignedFemales : unassignedMales
    if (rng.bool(0.55) && partnerQueue.length > 0) {
      const partner = partnerQueue.pop() as Person
      // generated couples start married (simplification; divorce arrives in Wave 3)
      person.partnerId = partner.id
      partner.partnerId = person.id
      person.maritalStatus = 'married'
      partner.maritalStatus = 'married'
      householdMembers.push([person.id, partner.id])
    } else if (person.sex === 'male') {
      unassignedMales.push(person)
    } else {
      unassignedFemales.push(person)
    }
  }
  for (const leftovers of [unassignedMales, unassignedFemales]) {
    for (const person of leftovers) householdMembers.push([person.id])
  }
  for (const members of householdMembers) createHousehold(ctx, members)

  // 3) minors join adult households (simplified: no orphan households)
  const personById = new Map(persons.map((p) => [p.id, p]))
  const adultHouseholds = ctx.world.households.filter((h) =>
    h.memberIds.some((id) => {
      const p = personById.get(id)
      return p !== undefined && ageYears(p.birthTick, 0) >= 18
    })
  )
  if (adultHouseholds.length === 0 && target > 0) throw new Error('population generated without any adult household')
  const minors = persons.filter((p) => ageYears(p.birthTick, 0) < 18)
  for (const minor of minors) {
    const household = adultHouseholds[rng.int(0, adultHouseholds.length - 1)]
    household.memberIds.push(minor.id)
    minor.householdId = household.id
  }

  // 4) employers + job assignment (structure only; wage/payroll flows live in @genesis/economy)
  const employable = adults.filter((p) => {
    const age = ageYears(p.birthTick, 0)
    return age >= 18 && age < 65
  })
  const employedCount = Math.floor(employable.length * ctx.config.employmentRate)
  const hired = rng.shuffle([...employable]).slice(0, employedCount)
  const employerCount = Math.max(1, Math.ceil(employedCount / 20))
  const employers: Employer[] = []
  for (let i = 0; i < employerCount; i++) {
    const slots = Math.max(1, Math.ceil(employedCount / employerCount))
    const wage = cents(220_000 + rng.int(0, 580) * 1_000) // $2,200 .. $8,000 / month
    employers.push(createEmployer(ctx, `Employer-${i + 1}`, slots, wage))
  }
  hired.forEach((person, i) => {
    const employer = employers[i % employers.length] as Employer
    person.economy.employerId = employer.id
    person.economy.monthlyIncomeCents = employer.monthlyWageCents
    employer.filledSlots++
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'job.started',
      tick: ctx.tick(),
      actorIds: [person.id, employer.id]
    })
  })

  // 5) initial wealth (structural seed; flows belong to @genesis/economy)
  const wealthRng = ctx.rng.fork('wealth')
  for (const person of persons) {
    if (person.economy.employerId !== null) {
      person.economy.wealthCents = wealthRng.int(0, 2_400) * 100 * 4 // up to ~24 months of typical savings
    } else {
      person.economy.wealthCents = wealthRng.int(0, 30_000)
    }
  }
}

/** Convenience stats used by tests, CLI and dashboards. */
export interface PopulationStats {
  persons: number
  alive: number
  children: number
  adults: number
  seniors: number
  households: number
  employers: number
  employed: number
  unemploymentRate: number
  male: number
  female: number
}

export function populationStats(ctx: SimContext): PopulationStats {
  const persons = ctx.world.persons
  const alive = persons.filter((p) => p.alive)
  const byStage = { child: 0, adult: 0, senior: 0 }
  let employed = 0
  let male = 0
  let female = 0
  for (const p of alive) {
    byStage[p.lifeStage]++
    if (p.economy.employerId !== null) employed++
    if (p.sex === 'male') male++
    else female++
  }
  const employable = alive.filter((p: Person) => p.lifeStage === 'adult').length
  return {
    persons: persons.length,
    alive: alive.length,
    children: byStage.child,
    adults: byStage.adult,
    seniors: byStage.senior,
    households: ctx.world.households.length,
    employers: ctx.world.employers.length,
    employed,
    unemploymentRate: employable === 0 ? 0 : 1 - employed / employable,
    male,
    female
  }
}

export function samplePerson(ctx: SimContext, rng: Rng): Person {
  const alive = ctx.world.persons.filter((p) => p.alive)
  if (alive.length === 0) throw new Error('no alive persons to sample')
  return alive[rng.int(0, alive.length - 1)] as Person
}
