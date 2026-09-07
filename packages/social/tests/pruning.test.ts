import { beforeAll, describe, expect, it } from 'vitest'
import type { SimulationEvent } from '@genesis/core'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import {
  FRIENDSHIP_PRUNE_FLOOR,
  PRUNE_FAMILIARITY_FLOOR,
  RelationshipGraph,
  socialSystem,
  weeklySocialUpdate
} from '@genesis/social'
import { makeContext, makePerson } from './helpers'

describe('KI-3: death sweep', () => {
  it('removes every edge touching a dead person before decay/interact/prune', () => {
    // Only one person alive, so no interactions can interfere; the sweep is
    // fully deterministic here. High familiarity would survive decay and both
    // prune floors — only the death sweep can remove these edges.
    const a = makePerson('a')
    const b = makePerson('b', { alive: false, deathTick: 0 })
    const c = makePerson('c', { alive: false, deathTick: 0 })
    const ctx = makeContext(11, [a, b, c])
    const graph = new RelationshipGraph()
    const ab = graph.ensureEdge('a', 'b', 0)
    ab.familiarity = 0.9 // mutual friendship
    a.social.relationshipIds.push('b')
    b.social.relationshipIds.push('a')
    const bc = graph.ensureEdge('b', 'c', 0)
    bc.familiarity = 0.9 // dead-dead edge

    weeklySocialUpdate(ctx, graph)

    expect(graph.size()).toBe(0)
    expect(a.social.relationshipIds).toEqual([])
    expect(b.social.relationshipIds).toEqual([]) // dead side is cleaned too
    expect(c.social.relationshipIds).toEqual([])
    expect(ctx.log.countOf('relationship.ended')).toBe(2)
    expect(ctx.metrics.counterValue('social.edges_cleared_death')).toBe(2)
    // adjacency index stays consistent with the edge map
    expect(graph.neighborsOf('a')).toEqual([])
    expect(graph.neighborsOf('b')).toEqual([])
  })
})

describe('KI-6: friendship drift', () => {
  it('terminates a neglected friendship below the floor; acquaintance floor unchanged', () => {
    // Seed pinned after verification: none of the six persons reaches the 10%
    // global fallback toward a watched edge this week, so the drift/prune
    // decisions below are exact. Deterministic thereafter.
    const m = makePerson('m')
    const n = makePerson('n')
    const x = makePerson('x')
    const y = makePerson('y')
    const w = makePerson('w')
    const z = makePerson('z')
    const ctx = makeContext(3, [m, n, x, y, w, z])
    const graph = new RelationshipGraph()
    const mn = graph.ensureEdge('m', 'n', 0)
    mn.familiarity = 0.14 // mutual friendship below FRIENDSHIP_PRUNE_FLOOR -> drift
    m.social.relationshipIds.push('n')
    n.social.relationshipIds.push('m')
    const xy = graph.ensureEdge('x', 'y', 0)
    xy.familiarity = 0.15 // exactly at the floor -> survives (strict <)
    x.social.relationshipIds.push('y')
    y.social.relationshipIds.push('x')
    const wz = graph.ensureEdge('w', 'z', 0)
    wz.familiarity = 0.049 // acquaintance below PRUNE_FAMILIARITY_FLOOR -> silent prune

    weeklySocialUpdate(ctx, graph)

    // drifted friendship: edge gone, both lists cleaned, event + counter
    expect(graph.edge('m', 'n')).toBeUndefined()
    expect(m.social.relationshipIds).toEqual([])
    expect(n.social.relationshipIds).toEqual([])
    expect(ctx.metrics.counterValue('social.friendships_drifted')).toBe(1)
    // silent acquaintance prune below PRUNE_FAMILIARITY_FLOOR (no event)
    expect(graph.edge('w', 'z')).toBeUndefined()
    expect(ctx.metrics.counterValue('social.edges_pruned')).toBe(1)
    // boundary protection: a friendship exactly at the floor survives
    const xyEdge = graph.edge('x', 'y')
    expect(xyEdge).toBeDefined()
    expect(xyEdge?.familiarity).toBe(0.15)
    // exactly one relationship.ended event, carrying reason 'drift'
    const endings = ctx.log.recentEvents().filter((e) => e.type === 'relationship.ended')
    expect(endings.length).toBe(1)
    expect(endings[0]?.actorIds).toEqual(['m', 'n'])
    expect((endings[0]?.payload as { reason?: string } | undefined)?.reason).toBe('drift')
  })

  it('a stale edge decays but stays above the acquaintance floor', () => {
    // Deterministic either way: untouched -> decay 0.2 * 0.9 = 0.18; refreshed
    // by the 10% fallback -> familiarity only rises. Both survive pruning.
    const a = makePerson('a')
    const b = makePerson('b')
    const ctx = makeContext(11, [a, b])
    const graph = new RelationshipGraph()
    const edge = graph.ensureEdge(a.id, b.id, 0)
    edge.familiarity = 0.2
    edge.lastInteractionTick = 0 - 24 * 200 // 200 days stale

    weeklySocialUpdate(ctx, graph)
    const after = graph.edge('a', 'b')
    expect(after).toBeDefined()
    expect(after?.familiarity).toBeGreaterThanOrEqual(0.2 * 0.9 - 1e-9)
    expect(after?.familiarity).toBeGreaterThanOrEqual(PRUNE_FAMILIARITY_FLOOR)
  })
})

describe('KI-3/KI-6 integration (200 residents, 3 years)', () => {
  let sim: Simulation
  let graph: RelationshipGraph
  let deathEndings: SimulationEvent[]

  beforeAll(() => {
    graph = new RelationshipGraph()
    sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 3 },
      { systems: [demographicsSystem, socialSystem(graph)] }
    )
    deathEndings = []
    sim.ctx.events.onAny((event: SimulationEvent) => {
      if (event.type === 'relationship.ended' && (event.payload as { reason?: string } | undefined)?.reason === 'death') {
        deathEndings.push(event)
      }
    })
    sim.run()
  })

  it('deaths happen and swept edges emit reason=death events', () => {
    expect(sim.ctx.world.persons.filter((p) => !p.alive).length).toBeGreaterThan(0)
    expect(deathEndings.length).toBeGreaterThan(0)
    const personById = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    for (const event of deathEndings) {
      expect(event.actorIds.length).toBe(2)
      // one dead endpoint normally; two when both endpoints died within the
      // same between-sweeps window (both-dead edges use canonical actorIds)
      const dead = event.actorIds.filter((id) => personById.get(id)?.alive === false)
      expect(dead.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('no edge touches a dead person; no relationshipIds references one', () => {
    const personById = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    for (const edge of graph.allEdges()) {
      expect(personById.get(edge.personA)?.alive).toBe(true)
      expect(personById.get(edge.personB)?.alive).toBe(true)
    }
    for (const person of sim.ctx.world.persons) {
      if (!person.alive) continue
      for (const relId of person.social.relationshipIds) {
        expect(personById.get(relId)?.alive).toBe(true)
      }
    }
    expect(() => checkInvariants(sim.ctx.world, sim.ctx.tick(), sim.ctx.world.seed)).not.toThrow()
  })

  it('active friendships survive 3 years (still mutual, familiarity >= floor)', () => {
    // familiarity >= FRIENDSHIP_PRUNE_FLOOR after 3 years implies contact
    // within the last few months (decay to the floor takes ~18 stale weeks),
    // i.e. the pair is actively interacting — exactly the protection KI-6
    // must preserve.
    const personById = new Map(sim.ctx.world.persons.map((p) => [p.id, p]))
    const survivors = graph.allEdges().filter((edge) => {
      if (edge.familiarity < FRIENDSHIP_PRUNE_FLOOR) return false
      const a = personById.get(edge.personA)
      const b = personById.get(edge.personB)
      return (
        a !== undefined && b !== undefined && a.alive && b.alive &&
        a.social.relationshipIds.includes(b.id) && b.social.relationshipIds.includes(a.id)
      )
    })
    expect(survivors.length).toBeGreaterThan(0)
  })
})

describe('KI-1/KI-6: bounded graph growth (200 residents, 5 years)', () => {
  // Measured (seed 42, post KI-3/KI-6): 2,486 edges over 188 alive = 13.22 per
  // alive person. Assertion = 2x headroom over the measurement (26.44 -> 27),
  // per the growth-cap rule. The earlier hope of < 8 per alive did not
  // materialize: drift terminates only NEGLECTED friendships by design (active
  // ones are protected — see FRIENDSHIP_PRUNE_FLOOR doc), so the per-capita
  // level stays roughly flat versus the KI-1 batch (13.57) while death sweeps
  // (436 edges cleared) and drift (126 friendships) now bound what used to be
  // strictly monotonic growth.
  const PER_ALIVE_CEILING = 27

  it('keeps per-capita edge growth bounded', () => {
    const graph = new RelationshipGraph()
    const sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 5 },
      { systems: [demographicsSystem, socialSystem(graph)] }
    )
    sim.run()
    const alive = sim.ctx.world.persons.filter((p) => p.alive).length
    const perAlive = graph.size() / alive
    // eslint-disable-next-line no-console
    console.log(
      `[KI-3/KI-6] 200x5y: ${graph.size()} edges, ${perAlive.toFixed(2)}/alive, ` +
        `drifted=${sim.ctx.metrics.counterValue('social.friendships_drifted')}, ` +
        `clearedDeath=${sim.ctx.metrics.counterValue('social.edges_cleared_death')}`
    )
    expect(graph.size()).toBeGreaterThan(0)
    expect(graph.size()).toBeLessThan(5000)
    expect(perAlive).toBeLessThan(PER_ALIVE_CEILING)
  })
})
