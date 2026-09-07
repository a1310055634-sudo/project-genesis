import { fnv1a } from '@genesis/shared'

/**
 * Deterministic RNG (guide §4.3): integer-only mulberry32, seedable with a
 * number or string. `Math.random()` is banned in simulation logic — everything
 * must flow through this interface.
 *
 * `fork(label)` derives an independent, deterministic sub-stream so modules can
 * draw randomness without disturbing each other's sequences.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [minIncl, maxIncl]. */
  int(minIncl: number, maxIncl: number): number
  /** True with probability p. */
  bool(p: number): boolean
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T
  /** In-place Fisher-Yates shuffle using this stream. */
  shuffle<T>(items: T[]): T[]
  /** Independent deterministic sub-stream. */
  fork(label: string): Rng
  /** Internal 32-bit state (for snapshots/tests). */
  readonly state: number
}

function seedFromString(seed: number | string): number {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new Error(`RNG seed must be finite, got ${seed}`)
    return seed >>> 0
  }
  return fnv1a(seed)
}

export function createRng(seed: number | string): Rng {
  let s = seedFromString(seed)
  if (s === 0) s = 0x9e3779b9

  const rng: Rng = {
    next() {
      // mulberry32: integer-only arithmetic, stable across platforms
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296
      if (!(v >= 0 && v < 1)) throw new Error(`RNG produced out-of-range value: ${v}`)
      return v
    },
    int(minIncl, maxIncl) {
      if (!Number.isInteger(minIncl) || !Number.isInteger(maxIncl)) {
        throw new Error(`RNG.int bounds must be integers, got [${minIncl}, ${maxIncl}]`)
      }
      if (maxIncl < minIncl) throw new Error(`RNG.int empty range [${minIncl}, ${maxIncl}]`)
      const span = maxIncl - minIncl + 1
      return minIncl + Math.floor(rng.next() * span)
    },
    bool(p) {
      if (!(p >= 0 && p <= 1)) throw new Error(`RNG.bool probability out of range: ${p}`)
      return rng.next() < p
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('RNG.pick on empty array')
      return items[rng.int(0, items.length - 1)]
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = rng.int(0, i)
        const tmp = items[i]
        items[i] = items[j]
        items[j] = tmp
      }
      return items
    },
    fork(label: string) {
      return createRng(`${seedFromString(seed)}:${label}`)
    },
    get state() {
      return s
    }
  }
  return rng
}
