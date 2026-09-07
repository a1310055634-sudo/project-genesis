import { createRng } from '@genesis/core'
import { Person, Personality, PsychologyState } from '@genesis/simulation'
import { generatePersonality } from '@genesis/psychology'

/** Neutral starting psychology shared by scenario cohorts. */
export function neutralPsychology(): PsychologyState {
  return {
    affectValence: 0,
    affectArousal: 0.3,
    stress: 0.2,
    needRest: 0.6,
    needSocial: 0.6,
    needEsteem: 0.6,
    wellbeing: 0.5
  }
}

/** Build a synthetic person without touching SimContext (tests only). */
export function makePerson(id: string, personality: Personality): Person {
  return {
    id,
    sex: 'female',
    birthTick: 0,
    alive: true,
    deathTick: null,
    lifeStage: 'adult',
    householdId: null,
    personality,
    psychology: neutralPsychology(),
    economy: { employerId: null, monthlyIncomeCents: 0, wealthCents: 0, lastMonthConsumptionCents: 0 },
    social: { relationshipIds: [] }
  }
}

/** A cohort of n persons with correlated traits from a fixed seed. */
export function makeCohort(seed: number | string, n: number): Person[] {
  const rng = createRng(seed)
  const out: Person[] = []
  for (let i = 0; i < n; i++) out.push(makePerson(`p${i}`, generatePersonality(rng)))
  return out
}

/** Deep copy of a cohort so two scenario groups start identical. */
export function cloneCohort(persons: Person[]): Person[] {
  return persons.map((p) => ({ ...p, personality: { ...p.personality }, psychology: { ...p.psychology } }))
}

export function meanStress(persons: Person[]): number {
  let sum = 0
  for (const p of persons) sum += p.psychology.stress
  return sum / persons.length
}

export function inRange(v: number, lo: number, hi: number): boolean {
  return Number.isFinite(v) && v >= lo && v <= hi
}
