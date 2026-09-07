import { Person, WorldState } from './types'

/**
 * Kinship queries over the parenthood chain (Wave 3.2 contract, red team
 * RT1-01 follow-up). Canonical location: simulation owns the schema, so it
 * owns kinship derivation. Domain packages (family) consume it.
 *
 * v1 kinship depth: parent/child, siblings (full/half via a shared parent),
 * grandparent/grandchild. Deeper relations (aunt/uncle/cousins) arrive with
 * Wave 3.3 if experiments need them (documented simplification).
 */
export interface KinshipIndex {
  /** All persons (alive or dead) with the given parent. */
  childrenOf(personId: string): Person[]
  /** Full/half siblings via a shared, non-null parent (excludes self). */
  siblingsOf(personId: string): Person[]
  /** Direct parents of a person (compact: only the known ones). */
  parentsOf(person: Person): Person[]
  /** v1 close-kin test: parent/child, siblings, grandparent/grandchild, self. */
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

  const isCloseKin = (a: Person, b: Person): boolean => {
    if (a.id === b.id) return true
    // parent/child
    if ([a.motherId, a.fatherId].includes(b.id)) return true
    if ([b.motherId, b.fatherId].includes(a.id)) return true
    // siblings (shared parent)
    const aParents = [a.motherId, a.fatherId].filter((id): id is string => id !== null)
    const bParents = [b.motherId, b.fatherId].filter((id): id is string => id !== null)
    if (aParents.some((id) => bParents.includes(id))) return true
    // grandparent/grandchild
    for (const parentId of aParents) {
      const parent = byId.get(parentId)
      if (parent !== undefined && [parent.motherId, parent.fatherId].includes(b.id)) return true
    }
    for (const parentId of bParents) {
      const parent = byId.get(parentId)
      if (parent !== undefined && [parent.motherId, parent.fatherId].includes(a.id)) return true
    }
    return false
  }

  return { childrenOf, siblingsOf, parentsOf, isCloseKin }
}
