import { describe, expect, it } from 'vitest'
import { RelationshipGraph, edgeKey } from '@genesis/social'

describe('relationship graph basics', () => {
  it('edgeKey is canonical: symmetric and stable', () => {
    expect(edgeKey('a', 'b')).toBe('a|b')
    expect(edgeKey('b', 'a')).toBe(edgeKey('a', 'b'))
  })

  it('ensureEdge is idempotent — the same pair never duplicates', () => {
    const graph = new RelationshipGraph()
    const first = graph.ensureEdge('person-2', 'person-1', 100)
    expect(graph.size()).toBe(1)
    const second = graph.ensureEdge('person-1', 'person-2', 200)
    expect(graph.size()).toBe(1)
    expect(second).toBe(first)
    expect(first.personA).toBe('person-1')
    expect(first.personB).toBe('person-2')
    expect(first.lastInteractionTick).toBe(100) // existing edge is not reset
  })

  it('new edges start with all values at zero', () => {
    const graph = new RelationshipGraph()
    const edge = graph.ensureEdge('x', 'y', 5)
    expect(edge).toMatchObject({
      familiarity: 0,
      trust: 0,
      liking: 0,
      conflict: 0,
      lastInteractionTick: 5
    })
  })

  it('allEdges is sorted by key; edgesOf and neighborsOf are correct', () => {
    const graph = new RelationshipGraph()
    graph.ensureEdge('c', 'a', 0)
    graph.ensureEdge('b', 'a', 0)
    graph.ensureEdge('c', 'b', 0)
    const keys = graph.allEdges().map((e) => e.key)
    expect(keys).toEqual(['a|b', 'a|c', 'b|c'])
    expect(graph.neighborsOf('a')).toEqual(['b', 'c'])
    expect(graph.neighborsOf('b')).toEqual(['a', 'c'])
    expect(graph.edgesOf('a').map((e) => e.key)).toEqual(['a|b', 'a|c'])
    expect(graph.neighborsOf('missing')).toEqual([])
    expect(graph.size()).toBe(3)
  })

  it('self edges are rejected', () => {
    const graph = new RelationshipGraph()
    expect(() => graph.ensureEdge('a', 'a', 0)).toThrow()
  })
})
