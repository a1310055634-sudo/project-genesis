import { describe, it, expect } from 'vitest'
import { createRng } from '@genesis/core'
import { Personality, PsychologyState } from '@genesis/simulation'
import { applyAffectEvent, decayAffect, decayNeeds, dailyPsychologyUpdate, generatePersonality, satisfyNeed, updateStress, PsychEnvironment } from '@genesis/psychology'
import { cloneCohort, inRange, makeCohort } from './helpers'

const EXTREME_ENV: PsychEnvironment = {
  financialStrain: 1,
  occupationalStrain: 1,
  relationshipConflict: 1,
  socialSupport: 0,
  adverseEvents: 1
}

const CALM_ENV: PsychEnvironment = {
  financialStrain: 0,
  occupationalStrain: 0,
  relationshipConflict: 0,
  socialSupport: 1,
  adverseEvents: 0
}

function psychInDomain(psych: PsychologyState): boolean {
  return (
    inRange(psych.affectValence, -1, 1) &&
    inRange(psych.affectArousal, 0, 1) &&
    inRange(psych.stress, 0, 1) &&
    inRange(psych.needRest, 0, 1) &&
    inRange(psych.needSocial, 0, 1) &&
    inRange(psych.needEsteem, 0, 1) &&
    inRange(psych.wellbeing, 0, 1)
  )
}

function personalityInDomain(p: Personality): boolean {
  return (
    inRange(p.openness, 0, 1) &&
    inRange(p.conscientiousness, 0, 1) &&
    inRange(p.extraversion, 0, 1) &&
    inRange(p.agreeableness, 0, 1) &&
    inRange(p.neuroticism, 0, 1)
  )
}

describe('boundary / adversarial inputs', () => {
  it('updateStress saturates under maximum load for 500 days without NaN', () => {
    const rng = createRng('max-load')
    const personality: Personality = { openness: 1, conscientiousness: 0, extraversion: 1, agreeableness: 0, neuroticism: 1 }
    let stress = 0
    for (let d = 0; d < 500; d++) {
      stress = updateStress(personality, stress, {
        financialStrain: 1,
        relationshipConflict: 1,
        occupationalStrain: 1,
        adverseEvents: 1,
        socialSupport: 0,
        copingResources: 0
      }, rng)
      expect(inRange(stress, 0, 1)).toBe(true)
    }
  })

  it('updateStress recovers from max stress under zero load without NaN', () => {
    const rng = createRng('calm')
    const personality: Personality = { openness: 0, conscientiousness: 1, extraversion: 0, agreeableness: 1, neuroticism: 0 }
    let stress = 1
    for (let d = 0; d < 500; d++) {
      stress = updateStress(personality, stress, {
        financialStrain: 0,
        relationshipConflict: 0,
        occupationalStrain: 0,
        adverseEvents: 0,
        socialSupport: 1,
        copingResources: 1
      }, rng)
      expect(inRange(stress, 0, 1)).toBe(true)
    }
    expect(stress).toBeLessThan(0.5)
  })

  it('dailyPsychologyUpdate keeps the whole psychology state in-domain over 500 extreme days', () => {
    const persons = makeCohort('boundary', 30)
    const rng = createRng('boundary-rng')
    for (let d = 0; d < 500; d++) {
      for (const p of persons) dailyPsychologyUpdate(p, EXTREME_ENV, rng)
    }
    for (const p of persons) {
      expect(psychInDomain(p.psychology)).toBe(true)
      expect(personalityInDomain(p.personality)).toBe(true)
    }
  })

  it('dailyPsychologyUpdate keeps the state in-domain on a fully calm env too', () => {
    const persons = cloneCohort(makeCohort('calm', 20))
    const rng = createRng('calm-rng')
    for (let d = 0; d < 500; d++) {
      for (const p of persons) dailyPsychologyUpdate(p, CALM_ENV, rng)
    }
    for (const p of persons) expect(psychInDomain(p.psychology)).toBe(true)
  })

  it('decayAffect handles absurdly large day counts without NaN or drift out of range', () => {
    const psych: PsychologyState = { affectValence: -1, affectArousal: 1, stress: 1, needRest: 1, needSocial: 1, needEsteem: 1, wellbeing: 0 }
    decayAffect(psych, 1e9, 0)
    expect(Number.isFinite(psych.affectValence)).toBe(true)
    expect(inRange(psych.affectValence, -1, 1)).toBe(true)
    expect(inRange(psych.affectArousal, 0, 1)).toBe(true)
  })

  it('decayNeeds collapses needs to 0 for huge day counts, staying in [0, 1]', () => {
    const psych: PsychologyState = { affectValence: 0, affectArousal: 0, stress: 0, needRest: 1, needSocial: 1, needEsteem: 1, wellbeing: 1 }
    decayNeeds(psych, 1e9)
    expect(psych.needRest).toBe(0)
    expect(psych.needSocial).toBe(0)
    expect(psych.needEsteem).toBe(0)
  })

  it('applyAffectEvent and satisfyNeed clamp extreme deltas', () => {
    const psych: PsychologyState = { affectValence: 0, affectArousal: 0.5, stress: 0.5, needRest: 0.5, needSocial: 0.5, needEsteem: 0.5, wellbeing: 0.5 }
    applyAffectEvent(psych, 1e9, 1e9)
    expect(psych.affectValence).toBe(1)
    expect(psych.affectArousal).toBe(1)
    applyAffectEvent(psych, -1e9, -1e9)
    expect(psych.affectValence).toBe(-1)
    expect(psych.affectArousal).toBe(0)
    satisfyNeed(psych, 'needRest', 1e9)
    expect(psych.needRest).toBe(1)
    satisfyNeed(psych, 'needEsteem', -1e9)
    expect(psych.needEsteem).toBe(0)
  })

  it('generatePersonality never leaves [0, 1] even across many fresh streams', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePersonality(createRng(`seed-${i}`))
      expect(personalityInDomain(p)).toBe(true)
    }
  })
})
