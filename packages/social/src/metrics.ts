import { SimContext } from '@genesis/simulation'
import { RelationshipGraph } from './graph'

/**
 * Graph gauges (deterministic; live in ctx.metrics):
 *  - social_edges:            number of distinct edges
 *  - social_mean_degree:      edges * 2 / alive persons
 *  - social_isolation_rate:   share of alive persons without any edge
 *  - social_friendships:      mutual-relationship pairs, approximated as the
 *                             total relationshipIds endpoint count / 2
 */
export function recordGraphMetrics(ctx: SimContext, graph: RelationshipGraph): void {
  const alive = ctx.world.persons.filter((p) => p.alive)
  const aliveCount = alive.length
  const edgeCount = graph.size()

  ctx.metrics.gauge('social_edges', edgeCount)
  ctx.metrics.gauge('social_mean_degree', aliveCount === 0 ? 0 : (edgeCount * 2) / aliveCount)

  const withEdge = new Set<string>()
  for (const edge of graph.allEdges()) {
    withEdge.add(edge.personA)
    withEdge.add(edge.personB)
  }
  let isolated = 0
  let friendshipEndpoints = 0
  for (const person of alive) {
    if (!withEdge.has(person.id)) isolated++
    friendshipEndpoints += person.social.relationshipIds.length
  }
  ctx.metrics.gauge('social_isolation_rate', aliveCount === 0 ? 0 : isolated / aliveCount)
  ctx.metrics.gauge('social_friendships', friendshipEndpoints / 2)
}
