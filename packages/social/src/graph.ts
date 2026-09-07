/**
 * Relationship graph (social layer): undirected edges between persons, keyed
 * by a canonical sorted-pair key so (a, b) and (b, a) are the same edge — no
 * duplicates by construction. All iterations return sorted snapshots, so Map
 * insertion order never leaks into behavior or serialization.
 *
 * Edge values (familiarity/trust/liking/conflict) live in [0, 1]; writers must
 * clamp before storing (use clamp01).
 */

export interface RelationshipEdge {
  key: string
  personA: string
  personB: string
  familiarity: number
  trust: number
  liking: number
  conflict: number
  lastInteractionTick: number
}

/** Canonical undirected edge key: the sorted pair joined with '|'. */
export function edgeKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Clamp to the bounded relationship domain [0, 1]. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function byKey(a: RelationshipEdge, b: RelationshipEdge): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export class RelationshipGraph {
  private readonly edges = new Map<string, RelationshipEdge>()

  /** Existing edge between a and b, if any. */
  edge(a: string, b: string): RelationshipEdge | undefined {
    return this.edges.get(edgeKey(a, b))
  }

  /**
   * Get or create the (a, b) edge. Idempotent: the same pair always yields the
   * same edge object; new edges start with all values at 0 and
   * lastInteractionTick = tick. Self edges are rejected (they are always a bug).
   */
  ensureEdge(a: string, b: string, tick: number): RelationshipEdge {
    if (a === b) throw new Error(`self edge is not allowed: ${a}`)
    const key = edgeKey(a, b)
    const existing = this.edges.get(key)
    if (existing !== undefined) return existing
    const [personA, personB] = a < b ? [a, b] : [b, a]
    const created: RelationshipEdge = {
      key,
      personA,
      personB,
      familiarity: 0,
      trust: 0,
      liking: 0,
      conflict: 0,
      lastInteractionTick: tick
    }
    this.edges.set(key, created)
    return created
  }

  /** Neighbor ids of id, ordered by their edge keys. */
  neighborsOf(id: string): string[] {
    const out: Array<{ key: string; other: string }> = []
    for (const e of this.edges.values()) {
      if (e.personA === id) out.push({ key: e.key, other: e.personB })
      else if (e.personB === id) out.push({ key: e.key, other: e.personA })
    }
    out.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    return out.map((n) => n.other)
  }

  /** All edges, ordered by key (canonical/deterministic serialization order). */
  allEdges(): RelationshipEdge[] {
    return [...this.edges.values()].sort(byKey)
  }

  /** Edges touching id, ordered by key. */
  edgesOf(id: string): RelationshipEdge[] {
    return this.allEdges().filter((e) => e.personA === id || e.personB === id)
  }

  /** Number of distinct edges. */
  size(): number {
    return this.edges.size
  }
}
