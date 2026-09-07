import { ageYears } from '@genesis/core'
import { demographicsSystem, Person, Simulation } from '@genesis/simulation'
import { familySystem } from '@genesis/family'

/** Total wealth across ALL persons (alive + dead) — the conservation probe. */
export function totalWealth(sim: Simulation): number {
  return sim.ctx.world.persons.reduce((sum, p) => sum + p.economy.wealthCents, 0)
}

/** Kill a person exactly the way the demographics system would. */
export function killLikeDemographics(sim: Simulation, person: Person): void {
  const world = sim.ctx.world
  person.alive = false
  person.deathTick = 0
  if (person.economy.employerId !== null) {
    const employer = world.employers.find((e) => e.id === person.economy.employerId)
    if (employer !== undefined) employer.filledSlots = Math.max(0, employer.filledSlots - 1)
    person.economy.employerId = null
    person.economy.monthlyIncomeCents = 0
  }
  if (person.householdId !== null) {
    const household = world.households.find((h) => h.id === person.householdId)
    if (household !== undefined) household.memberIds = household.memberIds.filter((id) => id !== person.id)
    person.householdId = null
  }
}

/**
 * Detach a person from any existing partner, closing the OTHER side's record
 * too (partnerId = null, status 'divorced') so no stale mutual pointer is left
 * behind for the partner-mutual invariant to trip over.
 */
function detachFromPartner(sim: Simulation, person: Person): void {
  if (person.partnerId === null) return
  const other = sim.ctx.world.persons.find((p) => p.id === person.partnerId)
  if (other !== undefined) {
    other.partnerId = null
    other.maritalStatus = 'divorced'
  }
  person.partnerId = null
  person.maritalStatus = 'divorced'
}

/**
 * Build a small world where one married man dies on the eve of the first
 * monthly tick holding the ONLY money in the world.
 *
 * Setup replicates what demographics does at death (release job slot, leave
 * household) so the hand-made state satisfies the global invariants, and
 * zeroes every other balance so wealth movements stay fully attributable (no
 * consumption/payroll system is registered; deaths of zero-wealth residents
 * transfer nothing).
 */
export function makeWidowWorld(seed: number | string, estateCents: number) {
  const sim = Simulation.create(
    { seed, populationTarget: 40, years: 1 },
    { systems: [demographicsSystem, familySystem()] }
  )
  const world = sim.ctx.world
  for (const person of world.persons) person.economy.wealthCents = 0

  const aliveAdult = (sex: 'male' | 'female'): Person => {
    const found = world.persons.find((p) => p.alive && p.sex === sex && ageYears(p.birthTick, 0) >= 18)
    if (found === undefined) throw new Error(`no alive adult ${sex} in generated population`)
    return found
  }
  const husband = aliveAdult('male')
  const wife = aliveAdult('female')

  // detach both from any generated spouse before forcing the test marriage
  detachFromPartner(sim, husband)
  detachFromPartner(sim, wife)
  husband.partnerId = wife.id
  wife.partnerId = husband.id
  husband.maritalStatus = 'married'
  wife.maritalStatus = 'married'
  husband.economy.wealthCents = estateCents

  killLikeDemographics(sim, husband)
  return { sim, husband, wife }
}
