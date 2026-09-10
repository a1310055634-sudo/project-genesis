import { Person, WorldState } from './types'

/**
 * Kinship queries over the parenthood chain and the spouse edges (Wave 3.2
 * contract, extended by the Wave 3.3 v2 deep-kinship upgrade — red team
 * RT2-07 follow-up). Canonical location: simulation owns the schema, so it
 * owns kinship derivation. Domain packages (family) consume it.
 *
 * v2 close-kin definition (what isCloseKin reports as banned):
 * - blood depth 1 (v1 set, unchanged): parent/child, full/half siblings via a
 *   shared parent, grandparent/grandchild;
 * - blood depth 2 (new): avunculate — uncle/aunt vs nephew/niece (one side's
 *   grandparent is the other side's direct parent) — and first cousins (their
 *   parents are siblings, i.e. both sides share any grandparent);
 * - first-degree affinity (new), derived over BOTH spouse-edge kinds —
 *   partnerId (the living marriage) and spouseAtDeathId (the death-time
 *   snapshot; a widow's deceased spouse still anchors the in-law relation):
 *   the parents of one's spouse (parents-in-law), the siblings of one's
 *   spouse, the spouse of one's parent (step-parent) and the spouse of one's
 *   sibling. Every check runs symmetrically over the pair, so the mirror
 *   relations are covered too: child-in-law (one's spouse's parent, seen from
 *   the other side), sibling's spouse, and step-child (the spouse of the
 *   other side's parent).
 *
 * v2 depth boundary — recorded SIMPLIFICATION, not an oversight (these stay
 * marriage-allowed): blood beyond depth 2 (great-grandparents, first cousins'
 * children, second cousins, great-avunculate) and affinity beyond degree 1
 * (an uncle's/aunt's spouse, a spouse's sibling's spouse, blended step-
 * siblings — a parent's spouse's own children — and double in-law pairs).
 * Each further hop adds query fan-out for negligible simulation realism, so
 * the ladder stops at blood depth 2 / affinity degree 1.
 *
 * Complexity contract: index build is one O(N) pass over world.persons; every
 * query touches only fixed fan-out (2 parent slots, ≤4 grandparent slots,
 * ≤2 spouse edges per person) with O(1) map lookups — never an O(N) scan, so
 * the family system's monthly courtship filter stays cheap.
 */
export interface KinshipIndex {
  /** All persons (alive or dead) with the given parent. */
  childrenOf(personId: string): Person[]
  /** Full/half siblings via a shared, non-null parent (excludes self). */
  siblingsOf(personId: string): Person[]
  /** Direct parents of a person (compact: only the known ones). */
  parentsOf(person: Person): Person[]
  /** v2 close-kin test: blood to depth 2 + first-degree affinity (see file doc). */
  isCloseKin(a: Person, b: Person): boolean
}

export function buildKinshipIndex(world: WorldState): KinshipIndex {
  const byId = new Map(world.persons.map((p) => [p.id, p]))
  const parentToChildren = new Map<string, string[]>()
  for (const person of world.persons) {
    for (const parentId of [person.motherId, person.fatherId]) {
      if (parentId === null) continue
      const list = parentToChildren.get(parentId)
      if (list === undefined) parentToChildren.set(parentId, [person.id])
      else list.push(person.id)
    }
  }
  // widow-side spouse edges (red team RT3-01): the death-time snapshot lives
  // on the DECEASED, so a living widow(er) has no forward reference to the
  // deceased spouse. Reverse-map survivor -> deceased so affinal kinship
  // queries for widows/widowers work (e.g. widow vs her late husband's brother).
  const deadSpouseOf = new Map<string, string[]>()
  for (const person of world.persons) {
    // PROCESS dead persons with a death-time spouse snapshot — the snapshot
    // only ever exists on the deceased, so skipping the dead here would leave
    // the reverse map permanently empty (the exact RT5-07 regression)
    if (person.alive || person.spouseAtDeathId === null) continue
    // a widow(er) can lose TWO spouses (remarriage + second death) — keep
    // every deceased spouse, not just the first
    const list = deadSpouseOf.get(person.spouseAtDeathId)
    if (list === undefined) deadSpouseOf.set(person.spouseAtDeathId, [person.id])
    else if (!list.includes(person.id)) list.push(person.id)
  }

  const childrenOf = (personId: string): Person[] =>
    (parentToChildren.get(personId) ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Person => p !== undefined)

  const parentsOf = (person: Person): Person[] =>
    [person.motherId, person.fatherId]
      .filter((id): id is string => id !== null)
      .map((id) => byId.get(id))
      .filter((p): p is Person => p !== undefined)


  const siblingsOf = (personId: string): Person[] => {
    const person = byId.get(personId)
    if (person === undefined) return []
    const myParents = [person.motherId, person.fatherId].filter((id): id is string => id !== null)
    if (myParents.length === 0) return []
    const seen = new Set<string>()
    const out: Person[] = []
    for (const parentId of myParents) {
      for (const sibling of parentToChildren.get(parentId) ?? []) {
        if (sibling === personId || seen.has(sibling)) continue
        seen.add(sibling)
        const p = byId.get(sibling)
        if (p !== undefined) out.push(p)
      }
    }
    return out
  }

  // ---------------------------------------------------------------------------
  // v2 helpers — all fixed fan-out, O(1) map lookups, deterministic field order
  // ---------------------------------------------------------------------------

  /** Non-null parent ids of a person record (fixed mother/father order). */
  const parentIdsOf = (person: Person): string[] =>
    person.motherId === null
      ? person.fatherId === null
        ? []
        : [person.fatherId]
      : person.fatherId === null
        ? [person.motherId]
        : [person.motherId, person.fatherId]

  const parentIdsById = (id: string): string[] => {
    const person = byId.get(id)
    return person === undefined ? [] : parentIdsOf(person)
  }

  /** Full/half-sibling test on two ids: shared non-null parent, never self. */
  const areSiblings = (aId: string, bId: string): boolean => {
    if (aId === bId) return false
    const aParents = parentIdsById(aId)
    if (aParents.length === 0) return false
    const bParents = parentIdsById(bId)
    return aParents.some((id) => bParents.includes(id))
  }

  /** Distinct grandparent ids (parents of parents), fan-out ≤ 4. */
  const grandparentIdsOf = (person: Person): string[] => {
    const out: string[] = []
    for (const parentId of parentIdsOf(person)) {
      const parent = byId.get(parentId)
      if (parent === undefined) continue
      for (const gpId of parentIdsOf(parent)) {
        if (!out.includes(gpId)) out.push(gpId)
      }
    }
    return out
  }

  /** Spouse-edge targets of a person: the living marriage (partnerId), the
   * death-time snapshot (spouseAtDeathId), and — for a living widow(er) —
   * the reverse-mapped deceased spouse (RT3-01). All anchor affinity. */
  const spouseEdgeIds = (person: Person): string[] => {
    const edges: string[] = []
    if (person.partnerId !== null) edges.push(person.partnerId)
    if (person.spouseAtDeathId !== null && person.spouseAtDeathId !== person.partnerId) {
      edges.push(person.spouseAtDeathId)
    }
    const widowedList = deadSpouseOf.get(person.id)
    if (widowedList !== undefined) {
      for (const widowed of widowedList) {
        if (!edges.includes(widowed)) edges.push(widowed)
      }
    }
    return edges
  }

  /** Directed spouse edge person -> target (either edge kind, both directions
   * of the death-time snapshot; a target may have buried multiple spouses). */
  const hasSpouseEdge = (person: Person, targetId: string): boolean => {
    if (spouseEdgeIds(person).includes(targetId)) return true
    const targetsDeceased = deadSpouseOf.get(targetId)
    return targetsDeceased !== undefined && targetsDeceased.includes(person.id)
  }

  const isCloseKin = (a: Person, b: Person): boolean => {
    if (a.id === b.id) return true
    const aParents = parentIdsOf(a)
    const bParents = parentIdsOf(b)

    // ---- blood depth 1 ----
    // parent/child
    if (aParents.includes(b.id) || bParents.includes(a.id)) return true
    // siblings (shared parent)
    if (aParents.some((id) => bParents.includes(id))) return true

    // ---- blood depth 2 ----
    const aGrandParents = grandparentIdsOf(a)
    const bGrandParents = grandparentIdsOf(b)
    // grandparent/grandchild (v1)
    if (aGrandParents.includes(b.id) || bGrandParents.includes(a.id)) return true
    // avunculate: one side's grandparent is the other's direct parent
    if (aGrandParents.some((id) => bParents.includes(id))) return true
    if (bGrandParents.some((id) => aParents.includes(id))) return true
    // first cousins: the parents are siblings (any shared grandparent)
    if (aGrandParents.some((id) => bGrandParents.includes(id))) return true

    // ---- first-degree affinity, checked symmetrically over both directions
    // and both spouse-edge kinds (partnerId + spouseAtDeathId) ----
    const aSpouseEdges = spouseEdgeIds(a)
    const bSpouseEdges = spouseEdgeIds(b)
    // parent-in-law / child-in-law: the other side is a parent of my spouse
    if (aSpouseEdges.some((s) => parentIdsById(s).includes(b.id))) return true
    if (bSpouseEdges.some((s) => parentIdsById(s).includes(a.id))) return true
    // spouse's sibling / sibling's spouse
    if (aSpouseEdges.some((s) => areSiblings(s, b.id))) return true
    if (bSpouseEdges.some((s) => areSiblings(s, a.id))) return true
    // step-parent / step-child: the other side is the spouse of my parent
    if (aParents.some((p) => {
      const parent = byId.get(p)
      return parent !== undefined && hasSpouseEdge(parent, b.id)
    })) return true
    if (bParents.some((p) => {
      const parent = byId.get(p)
      return parent !== undefined && hasSpouseEdge(parent, a.id)
    })) return true
    return false
  }

  return { childrenOf, siblingsOf, parentsOf, isCloseKin }
}
