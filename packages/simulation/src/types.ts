/**
 * Canonical world schema (DECISIONS.md): identity + component blocks.
 * Logic lives in domain packages; this file owns the DATA SHAPE only.
 * Everything is plain structured state — no methods, no classes with behavior.
 */

export type Sex = 'male' | 'female'
export type LifeStage = 'child' | 'adult' | 'senior'
/** Marital state machine (Wave 3 owns transitions; schema is canonical here). */
export type MaritalStatus = 'single' | 'married' | 'widowed' | 'divorced'

/** Big Five traits in [0, 1]. Generation logic belongs to @genesis/psychology. */
export interface Personality {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

/** Psychology state (all bounded). Update logic belongs to @genesis/psychology. */
export interface PsychologyState {
  /** Hedonic tone in [-1, 1]. */
  affectValence: number
  /** Physiological activation in [0, 1]. */
  affectArousal: number
  /** Perceived stress in [0, 1]. */
  stress: number
  /** Needs satisfaction in [0, 1]. */
  needRest: number
  needSocial: number
  needEsteem: number
  /** Subjective wellbeing in [0, 1]. */
  wellbeing: number
}

/** Economy state. Money is integer cents (guide §4.5). Flows belong to @genesis/economy. */
export interface EconomyState {
  employerId: string | null
  monthlyIncomeCents: number
  wealthCents: number
  lastMonthConsumptionCents: number
}

/** Social state. Graph logic belongs to @genesis/social. */
export interface SocialState {
  relationshipIds: string[]
}

export interface Person {
  id: string
  sex: Sex
  birthTick: number
  alive: boolean
  deathTick: number | null
  lifeStage: LifeStage
  householdId: string | null
  /** Id of the current spouse/partner; null when single/widowed/divorced. */
  partnerId: string | null
  maritalStatus: MaritalStatus
  /** Parenthood chain (red team RT1-01): null when unknown (e.g. founders). */
  motherId: string | null
  fatherId: string | null
  personality: Personality
  psychology: PsychologyState
  economy: EconomyState
  social: SocialState
}

export interface Household {
  id: string
  memberIds: string[]
}

export interface Employer {
  id: string
  name: string
  jobSlots: number
  filledSlots: number
  monthlyWageCents: number
}

/**
 * World state: plain data + index maps (maps are rebuilt from arrays, never
 * serialized — stable ordering comes from the creation-ordered arrays).
 */
export interface WorldState {
  seed: number
  persons: Person[]
  households: Household[]
  employers: Employer[]
}

export function lifeStageFor(age: number): LifeStage {
  if (age < 18) return 'child'
  if (age < 65) return 'adult'
  return 'senior'
}
