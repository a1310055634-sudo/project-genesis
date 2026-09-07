import { describe, expect, it } from 'vitest'
import { demographicsSystem, Simulation } from '@genesis/simulation'
import { digest, stableStringify } from '@genesis/shared'
import { RelationshipGraph, socialSystem } from '@genesis/social'

const CONFIG = { seed: 42, populationTarget: 200, years: 2 } as const

function runWithGraph(seed: number | string): string {
  const graph = new RelationshipGraph()
  const sim = Simulation.create({ ...CONFIG, seed }, { systems: [demographicsSystem, socialSystem(graph)] })
  sim.run()
  expect(graph.size()).toBeGreaterThan(0)
  return digest(stableStringify(graph.allEdges()))
}

describe('social determinism (GEN-011)', () => {
  it('same seed ⇒ identical edge set across independent runs', () => {
    const first = runWithGraph(42)
    const second = runWithGraph(42)
    expect(first).toBe(second)
  })

  it('string seeds replay identically too', () => {
    expect(runWithGraph('genesis-social')).toBe(runWithGraph('genesis-social'))
  })

  it('different seeds ⇒ different edge sets (digest reflects graph contents)', () => {
    expect(runWithGraph(42)).not.toBe(runWithGraph(7))
  })
})
