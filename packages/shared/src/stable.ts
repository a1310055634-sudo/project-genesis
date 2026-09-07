/**
 * Stable JSON serialization (sorted object keys) + FNV-1a 32-bit digest.
 * Used for deterministic replay verification and config hashing.
 * Array order is preserved (callers must keep arrays canonically ordered).
 */
export function stableStringify(value: unknown): string {
  return stableStringValue(value, 0)
}

function stableStringValue(value: unknown, depth: number): string {
  if (depth > 64) throw new Error('stableStringify: nesting too deep')
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') {
    const n = value as number
    if (!Number.isFinite(n)) throw new Error(`stableStringify: non-finite number ${n}`)
    return String(n)
  }
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringValue(v, depth + 1)).join(',') + ']'
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringValue(obj[k], depth + 1)).join(',') + '}'
  }
  throw new Error(`stableStringify: unsupported type ${t}`)
}

/** FNV-1a 32-bit hash of a string, returned as unsigned int. Integer-only, cross-platform stable. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // 32-bit integer multiply-emulate: hash *= 0x01000193 (mod 2^32)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash >>> 0
}

export function digest(value: unknown): string {
  return fnv1a(stableStringify(value)).toString(16).padStart(8, '0')
}
