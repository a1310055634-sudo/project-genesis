import { GenesisSystem, buildKinshipIndex, demographicsSystem } from '@genesis/simulation'
import { ageYears } from '@genesis/core'
import { educationSystem, skillOf } from '@genesis/education'
import { financialStrainOf, economySystems } from '@genesis/economy'
import { RelationshipGraph, socialSystem, socialSupportOf, relationshipConflictOf } from '@genesis/social'
import { caregiverLoadOf, psychologySystem, PsychEnvironment } from '@genesis/psychology'
import { familySystem } from '@genesis/family'
import { Person, SimContext } from '@genesis/simulation'

/**
 * Integration profile (GEN-115): composition root wiring all domain systems
 * into the engine. The bridges below are the ONLY place that knows how domains
 * connect; packages stay decoupled from each other.
 */

/**
 * Cross-domain environment bridge for the psychology system.
 * Simplifications (recorded):
 * - children are household-supported: low financial/occupational strain
 * - unemployed adults carry elevated occupational strain (v1 constant)
 * - adverseEvents is a constant baseline until a life-events system exists
 * - caregiverLoad = parents of alive children under 6 (kinship-chain derived)
 */
export function psychEnvBridge(graph: RelationshipGraph | null): (person: Person, ctx: SimContext) => PsychEnvironment {
  // kinship index cached per tick: rebuilt at most once per simulated day
  let cachedTick = -1
  let cachedKin: ReturnType<typeof buildKinshipIndex> | null = null
  return (person: Person, ctx: SimContext): PsychEnvironment => {
    const tick = ctx.tick()
    if (tick !== cachedTick || cachedKin === null) {
      cachedKin = buildKinshipIndex(ctx.world)
      cachedTick = tick
    }
    const child = person.lifeStage === 'child'
    const youngChildren = cachedKin
      .childrenOf(person.id)
      .filter((c) => c.alive && ageYears(c.birthTick, tick) < 6).length
    // EXP-003 knob: population-level community support shift, clamped [0, 1]
    const baseSupport = graph !== null ? socialSupportOf(graph, person) : 0.3
    const socialSupport = Math.min(1, Math.max(0, baseSupport + ctx.config.communitySupportBias))
    return {
      financialStrain: child ? 0.1 : financialStrainOf(person),
      occupationalStrain: child ? 0 : person.economy.employerId !== null ? 0.2 : 0.5,
      relationshipConflict: graph !== null ? relationshipConflictOf(graph, person) : 0,
      socialSupport,
      adverseEvents: 0.05,
      caregiverLoad: child ? 0 : caregiverLoadOf(youngChildren)
    }
  }
}

export interface FullStackProfile {
  systems: GenesisSystem[]
  graph: RelationshipGraph
}

/** Full society stack: demography + family + social + economy + psychology.
 * SINGLE-USE (red team RT2-10): each call builds a fresh graph + bridges bound
 * to one Simulation. Never reuse the returned systems array for a second
 * Simulation.create — the social graph and caches would cross worlds. */
export function fullStackSystems(): FullStackProfile {
  const graph = new RelationshipGraph()
  const systems: GenesisSystem[] = [
    demographicsSystem, // priority 10, monthly
    familySystem({
      // marriage affinity / divorce conflict come from the social graph's edges
      affinity: (_ctx, aId, bId) => graph.edge(aId, bId)?.liking ?? 0.3,
      conflict: (_ctx, aId, bId) => graph.edge(aId, bId)?.conflict ?? 0.1
    }), // priority 12, monthly
    educationSystem(), // priority 14, monthly (school enrolment, attainment, skill)
    socialSystem(graph), // priority 15, weekly
    // HT-12 final link: skill→wage coupling. Hires price once at
    // income-assignment time as employer wage × (0.5 + 1.5 × skill), so
    // unskilled hires earn half and fully-educated earn double the base wage.
    ...economySystems({
      wageSkillMultiplier: (ctx, personId) => 0.5 + 1.5 * skillOf(ctx, personId)
    }), // priorities 20/21/22/30
    psychologySystem(psychEnvBridge(graph)) // priority 20 (same-tick ties resolve by registration order: after consumption)
  ]
  return { systems, graph }
}
