/**
 * Relationship graph (social layer): undirected edges between persons, keyed
 * by a canonical sorted-pair key so (a, b) and (b, a) are the same edge — no
 * duplicates by construction. All iterations return sorted snapshots, so Map
 * insertion order never leaks into behavior or serialization.
 *
 * Edge values (familiarity/trust/liking/conflict) live in [0, 1]; writers must
 * clamp before storing (use clamp01).
 *
 * A derived adjacency index (person id -> neighbor id -> edge, both
 * directions) supports O(deg) neighbor/edge lookups for local partner
 * sampling, friend-of-friend cascades (KI-1) and zero-allocation edge
 * queries (KI-2a). It is rebuilt-in-place on ensure/remove and never
 * serialized; the edges Map stays the single source of truth.
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

/** Canonical undirected edge key: the sorted pair joined with '|'.
 * KI-2a (A1): direct comparison instead of array+sort — this sat at ~10% of
 * total CPU in the 10k×3y profile (KI2_PROFILE.md). */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
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
  /** KI-2a (A1): derived adjacency carries the EDGE OBJECT per direction —
   * `edge(a, b)` becomes two hash lookups with zero allocation (the old path
   * allocated a canonical key string per query, ~17% of total CPU). */
  private readonly adjacency = new Map<string, Map<string, RelationshipEdge>>()

  /** Existing edge between a and b, if any. */
  edge(a: string, b: string): RelationshipEdge | undefined {
    if (a === b) return undefined
    return this.adjacency.get(a)?.get(b)
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
    this.link(personA, personB, created)
    return created
  }

  /**
   * Remove the (a, b) edge if present (KI-1 acquaintance pruning).
   * Returns true when an edge was removed. Idempotent.
   */
  removeEdge(a: string, b: string): boolean {
    const key = edgeKey(a, b)
    const edge = this.edges.get(key)
    if (edge === undefined) return false
    this.edges.delete(key)
    this.unlink(edge.personA, edge.personB)
    return true
  }

  /** Neighbor ids of id, ordered by id (== ordered by their edge keys). */
  neighborsOf(id: string): string[] {
    const neighbors = this.adjacency.get(id)
    if (neighbors === undefined) return []
    return [...neighbors.keys()].sort()
  }

  /** All edges, ordered by key (canonical/deterministic serialization order). */
  allEdges(): RelationshipEdge[] {
    return [...this.edges.values()].sort(byKey)
  }

  /**
   * Iterate all edges in MAP INSERTION order (= edge creation order, which is
   * itself seed-derived and deterministic). KI-2a (A1): for per-edge
   * independent passes (decay/sweep/prune/count) where outcome does not
   * depend on visiting order — avoids the O(E log E) sort that allEdges()
   * pays on every weekly pass. NOT for canonical serialization (use allEdges).
   */
  forEachEdge(visit: (edge: RelationshipEdge) => void): void {
    for (const edge of this.edges.values()) visit(edge)
  }

  /** Edges touching id, ordered by key (O(deg) via the adjacency index). */
  edgesOf(id: string): RelationshipEdge[] {
    const neighbors = this.adjacency.get(id)
    if (neighbors === undefined) return []
    return [...neighbors.values()].sort(byKey)
  }

  /** Number of distinct edges. */
  size(): number {
    return this.edges.size
  }

  private link(x: string, y: string, edge: RelationshipEdge): void {
    let xs = this.adjacency.get(x)
    if (xs === undefined) {
      xs = new Map()
      this.adjacency.set(x, xs)
    }
    xs.set(y, edge)
    let ys = this.adjacency.get(y)
    if (ys === undefined) {
      ys = new Map()
      this.adjacency.set(y, ys)
    }
    ys.set(x, edge)
  }

  private unlink(x: string, y: string): void {
    const xs = this.adjacency.get(x)
    if (xs !== undefined) {
      xs.delete(y)
      if (xs.size === 0) this.adjacency.delete(x)
    }
    const ys = this.adjacency.get(y)
    if (ys !== undefined) {
      ys.delete(x)
      if (ys.size === 0) this.adjacency.delete(y)
    }
  }
}
