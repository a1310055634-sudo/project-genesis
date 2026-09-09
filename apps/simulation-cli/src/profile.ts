import { GenesisSystem, demographicsSystem } from '@genesis/simulation'
import { ageYears } from '@genesis/core'
import { educationSystem, skillOf } from '@genesis/education'
import { institutionsSystem } from '@genesis/institutions'
import { housingBurdenOf, housingSystem } from '@genesis/housing'
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
/**
 * KI-9 (red team RT3-10): lightweight daily caregiver counts. A single O(N)
 * pass over persons replaces the full kinship-index rebuild the bridge used
 * to pay every simulated day — the caregiver pathway only needs per-parent
 * young-child counts, not the whole affinity graph.
 */
export function buildYoungChildCounts(world: { persons: Person[] }, tick: number): Map<string, number> {
  const counts = new Map<string, number>()
  for (const child of world.persons) {
    if (!child.alive) continue
    if (ageYears(child.birthTick, tick) >= 6) continue
    for (const parentId of [child.motherId, child.fatherId]) {
      if (parentId === null) continue
      counts.set(parentId, (counts.get(parentId) ?? 0) + 1)
    }
  }
  return counts
}

export function psychEnvBridge(graph: RelationshipGraph | null): (person: Person, ctx: SimContext) => PsychEnvironment {
  // young-child counts cached per tick: rebuilt at most once per simulated day
  let cachedTick = -1
  let cachedCounts: Map<string, number> | null = null
  return (person: Person, ctx: SimContext): PsychEnvironment => {
    const tick = ctx.tick()
    if (tick !== cachedTick || cachedCounts === null) {
      cachedCounts = buildYoungChildCounts(ctx.world, tick)
      cachedTick = tick
    }
    const child = person.lifeStage === 'child'
    const youngChildren = cachedCounts.get(person.id) ?? 0
    // EXP-003 knob: population-level community support shift, clamped [0, 1]
    const baseSupport = graph !== null ? socialSupportOf(graph, person) : 0.3
    const socialSupport = Math.min(1, Math.max(0, baseSupport + ctx.config.communitySupportBias))
    // EXP-004 pathway: housing burden folds into financial strain (both are
    // budget-pressure channels; documented mixture 60/40)
    const housing = child ? 0.1 : housingBurdenOf(ctx, person)
    const financialStrain = child
      ? 0.1
      : Math.min(1, Math.max(0, 0.6 * financialStrainOf(person) + 0.4 * housing))
    return {
      financialStrain,
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

/** Full society stack: demography + family + housing + social + economy +
 * psychology. SINGLE-USE (red team RT2-10): each call builds a fresh graph +
 * bridges bound to one Simulation. Never reuse the returned systems array for
 * a second Simulation.create — the social graph and caches would cross worlds.
 * `housingCostMultiplier` defaults to 1 (baseline rent). */
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
    institutionsSystem(), // priority 14, monthly (school entities + pupil assignment; registered after education)
    housingSystem(), // priority 13, monthly (units + burden; reads config knob)
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
