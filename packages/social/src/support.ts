import { Person } from '@genesis/simulation'
import { clamp01, RelationshipGraph } from './graph'

/** Support baseline for persons without any resolvable friendship edge. */
export const SUPPORT_BASELINE = 0.1

/**
 * Social support = mean over the person's friendship edges (the ids listed in
 * social.relationshipIds) of mean(edge.trust, edge.liking).
 * Persons with no resolvable friendship edge get the 0.1 baseline.
 * Result is clamped to [0, 1].
 */
export function socialSupportOf(graph: RelationshipGraph, person: Person): number {
  let sum = 0
  let count = 0
  for (const relId of person.social.relationshipIds) {
    const edge = graph.edge(person.id, relId)
    if (edge === undefined) continue
    sum += (edge.trust + edge.liking) / 2
    count++
  }
  if (count === 0) return SUPPORT_BASELINE
  return clamp01(sum / count)
}
