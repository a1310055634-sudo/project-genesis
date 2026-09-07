import { createRng } from '@genesis/core'
import { createContext, normalizeConfig, Person, Personality, SimContext, WorldState } from '@genesis/simulation'

/** A 30-year-old adult at tick 0 (negative birthTick = existed before start). */
export const ADULT_BIRTHTICK = -30 * 8_640

/** Plain Person literal with neutral traits, overridable per field. */
export function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  const personality: Personality = {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.5
  }
  const person: Person = {
    id,
    sex: 'male',
    birthTick: ADULT_BIRTHTICK,
    alive: true,
    deathTick: null,
    lifeStage: 'adult',
    householdId: null,
    partnerId: null,
    maritalStatus: 'single',
    motherId: null,
    fatherId: null,
    spouseAtDeathId: null,
    personality,
    psychology: {
      affectValence: 0,
      affectArousal: 0.3,
      stress: 0.2,
      needRest: 0.7,
      needSocial: 0.6,
      needEsteem: 0.6,
      wellbeing: 0.5
    },
    economy: { employerId: null, monthlyIncomeCents: 0, wealthCents: 0, lastMonthConsumptionCents: 0 },
    social: { relationshipIds: [] }
  }
  return { ...person, ...overrides }
}

/** Minimal SimContext over a hand-built world (no population generation). */
export function makeContext(seed: number | string, persons: Person[], tick = 0): SimContext {
  const config = normalizeConfig({ seed, populationTarget: Math.max(1, persons.length), years: 1 })
  const world: WorldState = { seed: 0, persons: [...persons], households: [], employers: [] }
  const ctx = createContext(config, world, createRng(seed))
  ctx.clock.setTick(tick)
  return ctx
}
