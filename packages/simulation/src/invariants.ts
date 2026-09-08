import { Person, WorldState } from './types'
import { buildIndex } from './context'
import { buildKinshipIndex } from './kinship'

/**
 * Global invariant suite (guide §27). Violations throw with seed/tick/entity
 * context (guide §28) — a bare "Simulation failed" is forbidden.
 * All checks are index-based (no O(N²) scans).
 */
export class InvariantViolation extends Error {
  constructor(
    message: string,
    public readonly details: { invariant: string; seed: number; tick: number; entityIds: string[] }
  ) {
    super(`${message} [invariant=${details.invariant} seed=${details.seed} tick=${details.tick} entities=${details.entityIds.join(',')}]`)
    this.name = 'InvariantViolation'
  }
}

export interface InvariantRunStats {
  checks: number
  violations: number
}

export function checkInvariants(world: WorldState, tick: number, seed: number): InvariantRunStats {
  let checks = 0
  const fail = (invariant: string, message: string, entityIds: string[]): never => {
    throw new InvariantViolation(message, { invariant, seed, tick, entityIds })
  }

  const { personById, householdById, employerById } = buildIndex(world)

  for (const p of world.persons) {
    checks++
    if (!(p.birthTick <= tick)) fail('age-nonnegative', `person ${p.id} born after now`, [p.id])
    if (!Number.isInteger(p.economy.wealthCents) || !Number.isFinite(p.economy.wealthCents)) {
      fail('wealth-finite-integer', `person ${p.id} has invalid wealth ${p.economy.wealthCents}`, [p.id])
    }
    if (!Number.isInteger(p.economy.monthlyIncomeCents) || !Number.isFinite(p.economy.monthlyIncomeCents)) {
      fail('income-finite-integer', `person ${p.id} has invalid income ${p.economy.monthlyIncomeCents}`, [p.id])
    }
    if (p.deathTick !== null && p.deathTick < p.birthTick) {
      fail('death-after-birth', `person ${p.id} died before birth`, [p.id])
    }
    if (p.alive === false && p.deathTick === null) {
      fail('dead-has-death-tick', `dead person ${p.id} missing deathTick`, [p.id])
    }
    if (p.spouseAtDeathId !== null && p.alive) {
      fail('spouse-snapshot-only-on-dead', `alive person ${p.id} has spouseAtDeathId ${p.spouseAtDeathId}`, [p.id])
    }
    checkPsychology(p, fail)
  }

  const employerFillCount = new Map<string, number>()
  for (const e of world.employers) {
    checks++
    if (!Number.isInteger(e.filledSlots) || e.filledSlots < 0 || e.filledSlots > e.jobSlots) {
      fail('employer-slots-valid', `employer ${e.id} filledSlots ${e.filledSlots} invalid for jobSlots ${e.jobSlots}`, [e.id])
    }
    employerFillCount.set(e.id, 0)
  }

  for (const p of world.persons) {
    checks++
    if (p.householdId !== null) {
      const household = householdById.get(p.householdId)
      if (household === undefined) {
        fail('person-household-exists', `person ${p.id} references missing household ${p.householdId}`, [p.id, p.householdId])
      } else if (!household.memberIds.includes(p.id)) {
        fail('person-in-household-members', `person ${p.id} not in members of household ${p.householdId}`, [p.id, p.householdId])
      }
    }
    if (p.economy.employerId !== null) {
      if (!p.alive) fail('dead-not-employed', `dead person ${p.id} still employed at ${p.economy.employerId}`, [p.id])
      if (!employerById.has(p.economy.employerId)) {
        fail('employment-employer-exists', `person ${p.id} employed by missing employer ${p.economy.employerId}`, [p.id, p.economy.employerId])
      } else {
        employerFillCount.set(p.economy.employerId, (employerFillCount.get(p.economy.employerId) ?? 0) + 1)
      }
    }
    for (const relId of p.social.relationshipIds) {
      if (!personById.has(relId)) {
        fail('relationship-endpoints-exist', `person ${p.id} references missing relationship target ${relId}`, [p.id, relId])
      }
    }
    // partnership consistency (§27: no incompatible marital states)
    if (p.partnerId !== null) {
      const partner = personById.get(p.partnerId)
      if (partner === undefined) {
        fail('partner-exists', `person ${p.id} references missing partner ${p.partnerId}`, [p.id, p.partnerId])
      } else if (partner.partnerId !== p.id) {
        fail('partner-mutual', `person ${p.id} partners ${p.partnerId} but not vice versa (${partner.partnerId})`, [p.id, p.partnerId])
      }
    }
    if (p.maritalStatus === 'married' && p.partnerId === null) {
      fail('married-has-partner', `person ${p.id} is married but has no partnerId`, [p.id])
    }
    if (p.maritalStatus !== 'married' && p.partnerId !== null) {
      fail('nonmarried-partner-null', `person ${p.id} status=${p.maritalStatus} but partnerId=${p.partnerId}`, [p.id])
    }
    // parenthood chain (RT1-01): parents must exist and predate the child
    for (const [role, parentId] of [['mother', p.motherId], ['father', p.fatherId]] as const) {
      if (parentId === null) continue
      const parent = personById.get(parentId)
      if (parent === undefined) {
        fail('parent-exists', `person ${p.id} references missing ${role} ${parentId}`, [p.id, parentId])
      } else if (parent.birthTick >= p.birthTick) {
        fail('parent-older-than-child', `person ${p.id} ${role} ${parentId} not older than child`, [p.id, parentId])
      }
    }
    if (p.spouseAtDeathId !== null && !personById.has(p.spouseAtDeathId)) {
      fail('spouse-snapshot-exists', `person ${p.id} references missing spouseAtDeathId ${p.spouseAtDeathId}`, [p.id])
    }
  }

  for (const h of world.households) {
    checks++
    const seen = new Set<string>()
    for (const memberId of h.memberIds) {
      if (!personById.has(memberId)) {
        fail('household-members-exist', `household ${h.id} references missing person ${memberId}`, [h.id, memberId])
      }
      if (seen.has(memberId)) {
        fail('household-members-unique', `household ${h.id} lists ${memberId} twice`, [h.id, memberId])
      }
      seen.add(memberId)
    }
  }

  for (const [employerId, count] of employerFillCount) {
    checks++
    const employer = employerById.get(employerId)
    if (employer !== undefined && employer.filledSlots !== count) {
      fail(
        'employer-filled-slots-consistent',
        `employer ${employerId} filledSlots=${employer.filledSlots} but ${count} persons reference it`,
        [employerId]
      )
    }
  }

  // semantic marriage check (red team RT3-07): married couples must never be
  // close kin — guards GEN-060 against future refactor regressions
  const kin = buildKinshipIndex(world)
  for (const person of world.persons) {
    if (!person.alive || person.maritalStatus !== 'married' || person.partnerId === null) continue
    checks++
    const partner = personById.get(person.partnerId)
    if (partner === undefined) continue // already covered by partner-exists
    if (kin.isCloseKin(person, partner)) {
      fail('married-not-close-kin', `married pair ${person.id}/${partner.id} are close kin`, [person.id, partner.id])
    }
  }

  return { checks, violations: 0 }
}

function checkPsychology(
  p: Person,
  fail: (invariant: string, message: string, entityIds: string[]) => never
): void {
  const psych = p.psychology
  const bounded: Array<[string, number, number, number]> = [
    ['affectValence', psych.affectValence, -1, 1],
    ['affectArousal', psych.affectArousal, 0, 1],
    ['stress', psych.stress, 0, 1],
    ['needRest', psych.needRest, 0, 1],
    ['needSocial', psych.needSocial, 0, 1],
    ['needEsteem', psych.needEsteem, 0, 1],
    ['wellbeing', psych.wellbeing, 0, 1]
  ]
  for (const [name, value, lo, hi] of bounded) {
    if (!Number.isFinite(value) || value < lo || value > hi) {
      fail('psychology-values-in-domain', `person ${p.id} ${name}=${value} out of [${lo}, ${hi}]`, [p.id])
    }
  }
  for (const [name, value] of Object.entries(p.personality)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      fail('personality-in-domain', `person ${p.id} personality.${name}=${value} out of [0, 1]`, [p.id])
    }
  }
}
