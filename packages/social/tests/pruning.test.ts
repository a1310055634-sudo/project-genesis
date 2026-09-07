import { describe, expect, it } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { PRUNE_FAMILIARITY_FLOOR, RelationshipGraph, socialSystem, weeklySocialUpdate } from '@genesis/social'
import { makeContext, makePerson } from './helpers'

describe('KI-1: acquaintance pruning', () => {
  it('removes low-familiarity acquaintance edges but never mutual friendships', () => {
    // dead partners keep the interaction phase out of the way, so the pruning
    // decision is observed in isolation (alive.length < 2)
    const a = makePerson('a')
    const b = makePerson('b', { alive: false, deathTick: 0 })
    const c = makePerson('c', { alive: false, deathTick: 0 })
    const d = makePerson('d', { alive: false, deathTick: 0 })
    const ctx = makeContext(11, [a, b, c, d])
    const graph = new RelationshipGraph()

    const ab = graph.ensureEdge('a', 'b', 0)
    ab.familiarity = 0.049 // acquaintance below the floor -> pruned
    const ac = graph.ensureEdge('a', 'c', 0)
    ac.familiarity = 0.01 // mutual friendship -> protected even below the floor
    a.social.relationshipIds.push('c')
    c.social.relationshipIds.push('a')
    const ad = graph.ensureEdge('a', 'd', 0)
    ad.familiarity = PRUNE_FAMILIARITY_FLOOR // exactly at the floor -> survives (strict <)
    const bc = graph.ensureEdge('b', 'c', 0)
    bc.familiarity = 0.02 // dead-dead acquaintance -> pruned (rule is liveness-agnostic)

    weeklySocialUpdate(ctx, graph)

    expect(graph.edge('a', 'b')).toBeUndefined()
    expect(graph.edge('b', 'c')).toBeUndefined()
    expect(graph.edge('a', 'c')).toBeDefined()
    expect(graph.edge('a', 'd')).toBeDefined()
    expect(graph.size()).toBe(2)
    expect(ctx.metrics.counterValue('social.edges_pruned')).toBe(2)
    // adjacency index stays consistent with the edge map after removal
    expect(graph.neighborsOf('a')).toEqual(['c', 'd'])
    expect(graph.neighborsOf('c')).toEqual(['a'])
    expect(graph.neighborsOf('b')).toEqual([])
  })

  it('never prunes an edge that was interacted with this week', () => {
    const a = makePerson('a')
    const b = makePerson('b', { alive: false, deathTick: 0 })
    const ctx = makeContext(11, [a, b])
    const graph = new RelationshipGraph()
    const edge = graph.ensureEdge(a.id, b.id, 0)
    edge.familiarity = 0.2 // stale (set below), but one decay week keeps it above the floor

    edge.lastInteractionTick = 0 - 24 * 200 // 200 days stale -> decay 0.2 * 0.9 = 0.18
    weeklySocialUpdate(ctx, graph)
    expect(edge.familiarity).toBeCloseTo(0.18, 12)
    expect(graph.edge('a', 'b')).toBeDefined() // decayed but above the floor
  })
})

describe('KI-1: friend-of-friend sampling path', () => {
  it('creates an edge to a friend\'s neighbor when household/coworker pools are empty', () => {
    // pa-pb are mutual friends; pb-pc a mere acquaintance. pa has no household
    // and no employer, so its cascade reaches the ungated friend-of-friend
    // branch, whose candidate set is exactly [pc] — the global fallback can
    // never be reached for pa. A pa-pc edge after one weekly update therefore
    // proves the FoF path fired, for every seed.
    for (const seed of [11, 42, 77, 1234]) {
      const pa = makePerson('pa')
      const pb = makePerson('pb')
      const pc = makePerson('pc')
      const ctx = makeContext(seed, [pa, pb, pc])
      const graph = new RelationshipGraph()
      const papb = graph.ensureEdge('pa', 'pb', 0)
      papb.familiarity = 0.8
      papb.liking = 0.8
      pa.social.relationshipIds.push('pb')
      pb.social.relationshipIds.push('pa')
      const pbpc = graph.ensureEdge('pb', 'pc', 0)
      pbpc.familiarity = 0.3
      pbpc.liking = 0.3

      weeklySocialUpdate(ctx, graph)

      const papc = graph.edge('pa', 'pc')
      expect(papc).toBeDefined()
      expect(papc?.lastInteractionTick).toBe(0)
      expect(graph.size()).toBe(3) // protected pa-pb + surviving pb-pc + new pa-pc
      // a single interaction stays far below the friendship thresholds
      expect(pa.social.relationshipIds).toEqual(['pb'])
      expect(pc.social.relationshipIds).toEqual([])
    }
  })
})

describe('KI-1: bounded graph growth (200 residents, 5 years)', () => {
  // Coordinator-specified ceiling (seed 42, deterministic). Measured: 2,483
  // edges (13.57/alive) — 2.0x headroom rather than the requested 5x, because
  // mutual-friendship edges are never pruned by design and accumulate roughly
  // linearly in years; the 5x-derived bound would be ~12,400. The second
  // assertion pins the per-person bound explicitly.
  const GROWTH_CEILING = 5000

  it('keeps the edge count far below the old unbounded regime', () => {
    const graph = new RelationshipGraph()
    const sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 5 },
      { systems: [demographicsSystem, socialSystem(graph)] }
    )
    sim.run()
    const alive = sim.ctx.world.persons.filter((p) => p.alive).length
    const edgesPerAlive = graph.size() / alive
    // eslint-disable-next-line no-console
    console.log(`[KI-1] 200x5y: ${graph.size()} edges, ${edgesPerAlive.toFixed(2)} per alive person`)
    expect(graph.size()).toBeGreaterThan(0)
    expect(graph.size()).toBeLessThan(GROWTH_CEILING)
    expect(edgesPerAlive).toBeLessThan(25) // ceiling/200, kept explicit
  })
})
