import { describe, expect, it } from 'vitest'
import { RelationshipGraph, relationshipConflictOf, socialSupportOf, SUPPORT_BASELINE } from '@genesis/social'
import { makePerson } from './helpers'

describe('social support & conflict aggregates', () => {
  it('a person without relationships gets the 0.1 support baseline and 0 conflict', () => {
    const loner = makePerson('loner')
    const graph = new RelationshipGraph()
    expect(socialSupportOf(graph, loner)).toBe(SUPPORT_BASELINE)
    expect(socialSupportOf(graph, loner)).toBe(0.1)
    expect(relationshipConflictOf(graph, loner)).toBe(0)
  })

  it('support is the mean of trust and liking across friendship edges', () => {
    const graph = new RelationshipGraph()
    const a = makePerson('p1')
    const b = makePerson('p2')
    const c = makePerson('p3')
    const ab = graph.ensureEdge(a.id, b.id, 0)
    ab.trust = 0.8
    ab.liking = 0.4 // edge mean 0.6
    const ac = graph.ensureEdge(a.id, c.id, 0)
    ac.trust = 0.2
    ac.liking = 0.3 // edge mean 0.25
    a.social.relationshipIds.push(b.id, c.id)
    expect(socialSupportOf(graph, a)).toBeCloseTo((0.6 + 0.25) / 2, 12)
  })

  it('conflict is the mean of edge conflict; relationshipIds without edges are skipped', () => {
    const graph = new RelationshipGraph()
    const a = makePerson('p1')
    const b = makePerson('p2')
    const ab = graph.ensureEdge(a.id, b.id, 0)
    ab.conflict = 0.3
    a.social.relationshipIds.push(b.id, 'ghost') // 'ghost' has no edge → skipped
    expect(relationshipConflictOf(graph, a)).toBeCloseTo(0.3, 12)
    expect(socialSupportOf(graph, a)).toBe(0) // the one resolvable edge still has zero values
  })

  it('results are clamped to [0, 1]', () => {
    const graph = new RelationshipGraph()
    const a = makePerson('p1')
    const b = makePerson('p2')
    const edge = graph.ensureEdge(a.id, b.id, 0)
    edge.trust = 1.4
    edge.liking = 0.9
    edge.conflict = 2
    a.social.relationshipIds.push(b.id)
    expect(socialSupportOf(graph, a)).toBe(1)
    expect(relationshipConflictOf(graph, a)).toBe(1)
  })
})
