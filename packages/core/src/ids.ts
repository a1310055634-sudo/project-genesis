import { fnv1a } from '@genesis/shared'

/**
 * Deterministic entity IDs (GEN-008): sequential per prefix, zero-padded,
 * never random. Same creation order under the same seed ⇒ same ids.
 */
export class EntityIdIssuer {
  private counters = new Map<string, number>()

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, n)
    return `${prefix}-${String(n).padStart(6, '0')}`
  }

  issued(prefix: string): number {
    return this.counters.get(prefix) ?? 0
  }

  /** Stable hash of issuer state — used by replay digests. */
  fingerprint(): number {
    const parts = [...this.counters.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    return fnv1a(parts.map(([k, v]) => `${k}:${v}`).join('|'))
  }
}
