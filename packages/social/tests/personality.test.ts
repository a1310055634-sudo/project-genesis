import { describe, expect, it } from 'vitest'
import { Person, Personality } from '@genesis/simulation'
import { RelationshipGraph, weeklySocialUpdate } from '@genesis/social'
import { makeContext, makePerson } from './helpers'

function personalityWith(agreeableness: number, neuroticism: number): Personality {
  return { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness, neuroticism }
}

/** Run one weekly update on an isolated pair; return the liking delta. */
function likingGain(seed: number, agreeA: number, agreeB: number): number {
  const a = makePerson('pa', { personality: personalityWith(agreeA, 0.5) })
  const b = makePerson('pb', { personality: personalityWith(agreeB, 0.5) })
  const ctx = makeContext(seed, [a, b])
  const graph = new RelationshipGraph()
  graph.ensureEdge(a.id, b.id, ctx.tick())
  const before = graph.edge(a.id, b.id)?.liking ?? 0
  weeklySocialUpdate(ctx, graph)
  return (graph.edge(a.id, b.id)?.liking ?? 0) - before
}

/** Run one weekly update on an isolated pair; return the conflict delta. */
function conflictGain(seed: number, neuroA: number, neuroB: number): number {
  const a = makePerson('pa', { personality: personalityWith(0.5, neuroA) })
  const b = makePerson('pb', { personality: personalityWith(0.5, neuroB) })
  const ctx = makeContext(seed, [a, b])
  const graph = new RelationshipGraph()
  graph.ensureEdge(a.id, b.id, ctx.tick())
  const before = graph.edge(a.id, b.id)?.conflict ?? 0
  weeklySocialUpdate(ctx, graph)
  return (graph.edge(a.id, b.id)?.conflict ?? 0) - before
}

describe('personality effects on interaction outcomes (statistical)', () => {
  it('high-agreeableness pairs gain at least as much liking on average as low-agreeableness pairs', () => {
    const pairs = 200
    let highSum = 0
    let lowSum = 0
    for (let i = 0; i < pairs; i++) {
      highSum += likingGain(i, 0.85 - (i % 10) * 0.01, 0.85 - ((i * 3) % 10) * 0.01)
      lowSum += likingGain(i + 10_000, 0.15 + (i % 10) * 0.01, 0.15 + ((i * 3) % 10) * 0.01)
    }
    expect(highSum / pairs).toBeGreaterThanOrEqual(lowSum / pairs)
  })

  it('high-neuroticism pairs gain at least as much conflict on average as low-neuroticism pairs', () => {
    const pairs = 200
    let highSum = 0
    let lowSum = 0
    for (let i = 0; i < pairs; i++) {
      highSum += conflictGain(i, 0.9 - (i % 10) * 0.01, 0.9 - ((i * 3) % 10) * 0.01)
      lowSum += conflictGain(i + 20_000, 0.1 + (i % 10) * 0.01, 0.1 + ((i * 3) % 10) * 0.01)
    }
    expect(highSum / pairs).toBeGreaterThanOrEqual(lowSum / pairs)
  })
})
