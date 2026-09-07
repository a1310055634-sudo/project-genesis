import { beforeAll, describe, expect, it } from 'vitest'
import { checkInvariants, demographicsSystem, Simulation } from '@genesis/simulation'
import {
  RelationshipGraph,
  recordGraphMetrics,
  relationshipConflictOf,
  socialSupportOf,
  socialSystem,
  TICKS_PER_WEEK,
  weeklySocialUpdate
} from '@genesis/social'
import { makeContext, makePerson } from './helpers'

describe('small-world formation (seed 42, 200 residents, 2 years)', () => {
  let sim: Simulation
  let graph: RelationshipGraph

  beforeAll(() => {
    graph = new RelationshipGraph()
    sim = Simulation.create(
      { seed: 42, populationTarget: 200, years: 2 },
      { systems: [demographicsSystem, socialSystem(graph)] }
    )
    sim.run()
  })

  it('builds a non-empty graph over the run', () => {
    expect(sim.ctx.clock.tick).toBe(2 * 8_640)
    expect(graph.size()).toBeGreaterThan(0)
  })

  it('forms at least 3 friendships (relationship.started events >= 3)', () => {
    expect(sim.ctx.log.countOf('relationship.started')).toBeGreaterThanOrEqual(3)
  })

  it('world invariants hold — every relationshipId references an existing person', () => {
    expect(() => checkInvariants(sim.ctx.world, sim.ctx.tick(), sim.ctx.world.seed)).not.toThrow()
  })

  it('support and conflict stay within [0, 1] for every alive person', () => {
    for (const person of sim.ctx.world.persons) {
      if (!person.alive) continue
      const support = socialSupportOf(graph, person)
      expect(support).toBeGreaterThanOrEqual(0)
      expect(support).toBeLessThanOrEqual(1)
      const conflict = relationshipConflictOf(graph, person)
      expect(conflict).toBeGreaterThanOrEqual(0)
      expect(conflict).toBeLessThanOrEqual(1)
    }
  })

  it('records graph metrics consistently with the graph and world state', () => {
    recordGraphMetrics(sim.ctx, graph)
    const metrics = sim.ctx.metrics
    expect(metrics.gaugeValue('social_edges')).toBe(graph.size())
    const alive = sim.ctx.world.persons.filter((p) => p.alive)
    expect(metrics.gaugeValue('social_mean_degree')).toBeCloseTo((graph.size() * 2) / alive.length, 9)
    const isolation = metrics.gaugeValue('social_isolation_rate')
    expect(isolation).toBeGreaterThanOrEqual(0)
    expect(isolation).toBeLessThanOrEqual(1)
    const endpoints = alive.reduce((sum, p) => sum + p.social.relationshipIds.length, 0)
    expect(metrics.gaugeValue('social_friendships')).toBeCloseTo(endpoints / 2, 9)
  })
})

describe('familiarity decay (> 180 days stale)', () => {
  it('decays a stale edge exactly once per weekly run', () => {
    const a = makePerson('a')
    const b = makePerson('b', { alive: false, deathTick: 0 }) // no partner ⇒ no interaction refresh
    const ctx = makeContext(7, [a, b])
    const graph = new RelationshipGraph()
    const edge = graph.ensureEdge(a.id, b.id, 0)
    edge.familiarity = 0.8
    const staleStamp = ctx.tick() - 24 * 200 // 200 days ago, beyond the 180-day threshold
    edge.lastInteractionTick = staleStamp

    weeklySocialUpdate(ctx, graph)
    expect(edge.familiarity).toBeCloseTo(0.8 * 0.9, 12)
    expect(edge.lastInteractionTick).toBe(staleStamp) // decay is passive; the stamp stays

    ctx.clock.advance(TICKS_PER_WEEK) // next weekly run at tick 168
    weeklySocialUpdate(ctx, graph)
    expect(edge.familiarity).toBeCloseTo(0.8 * 0.9 * 0.9, 12)
  })

  it('a freshly touched edge is not decayed', () => {
    const a = makePerson('a')
    const b = makePerson('b', { alive: false, deathTick: 0 })
    const ctx = makeContext(7, [a, b])
    const graph = new RelationshipGraph()
    const edge = graph.ensureEdge(a.id, b.id, ctx.tick())
    edge.familiarity = 0.5
    edge.lastInteractionTick = ctx.tick()

    weeklySocialUpdate(ctx, graph)
    expect(edge.familiarity).toBe(0.5)
  })
})
