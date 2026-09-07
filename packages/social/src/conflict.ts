import { Person } from '@genesis/simulation'
import { clamp01, RelationshipGraph } from './graph'

/**
 * Relationship conflict = mean of edge.conflict over the person's friendship
 * edges (the ids listed in social.relationshipIds). No edges → 0.
 * Result is clamped to [0, 1].
 */
export function relationshipConflictOf(graph: RelationshipGraph, person: Person): number {
  let sum = 0
  let count = 0
  for (const relId of person.social.relationshipIds) {
    const edge = graph.edge(person.id, relId)
    if (edge === undefined) continue
    sum += edge.conflict
    count++
  }
  if (count === 0) return 0
  return clamp01(sum / count)
}
