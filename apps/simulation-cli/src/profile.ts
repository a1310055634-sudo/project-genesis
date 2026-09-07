import { GenesisSystem, demographicsSystem } from '@genesis/simulation'
import { financialStrainOf, economySystems } from '@genesis/economy'
import { RelationshipGraph, socialSystem, socialSupportOf, relationshipConflictOf } from '@genesis/social'
import { psychologySystem, PsychEnvironment } from '@genesis/psychology'
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
 */
export function psychEnvBridge(graph: RelationshipGraph | null): (person: Person, ctx: SimContext) => PsychEnvironment {
  return (person: Person, _ctx: SimContext): PsychEnvironment => {
    const child = person.lifeStage === 'child'
    return {
      financialStrain: child ? 0.1 : financialStrainOf(person),
      occupationalStrain: child ? 0 : person.economy.employerId !== null ? 0.2 : 0.5,
      relationshipConflict: graph !== null ? relationshipConflictOf(graph, person) : 0,
      socialSupport: graph !== null ? socialSupportOf(graph, person) : 0.3,
      adverseEvents: 0.05
    }
  }
}

export interface FullStackProfile {
  systems: GenesisSystem[]
  graph: RelationshipGraph
}

/** Full society stack: demography + family + social + economy + psychology. */
export function fullStackSystems(): FullStackProfile {
  const graph = new RelationshipGraph()
  const systems: GenesisSystem[] = [
    demographicsSystem, // priority 10, monthly
    familySystem({
      // marriage affinity / divorce conflict come from the social graph's edges
      affinity: (_ctx, aId, bId) => graph.edge(aId, bId)?.liking ?? 0.3,
      conflict: (_ctx, aId, bId) => graph.edge(aId, bId)?.conflict ?? 0.1
    }), // priority 12, monthly
    socialSystem(graph), // priority 15, weekly
    ...economySystems(), // priorities 20/21/22/30
    psychologySystem(psychEnvBridge(graph)) // priority 20 (same-tick ties resolve by registration order: after consumption)
  ]
  return { systems, graph }
}
