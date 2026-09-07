/**
 * Deterministic descriptive statistics for experiment arms (Wave 5, guide §23).
 * Pure functions over finite samples; no randomness, no wall-clock time.
 *
 * All values are model-internal aggregates over Genesis simulation runs —
 * they carry no real-world causal claims.
 */

/** Arithmetic mean. Throws on an empty sample (callers must guard n > 0). */
export function mean(values: number[]): number {
  if (values.length === 0) throw new Error('mean: empty sample')
  let sum = 0
  for (const v of values) {
    if (!Number.isFinite(v)) throw new Error(`mean: non-finite sample value ${v}`)
    sum += v
  }
  return sum / values.length
}

/**
 * Population standard deviation (denominator n, not n-1): the seeds of an arm
 * are the entire configured sample, not a statistical draw from a larger one.
 * Single-element sample → 0. Throws on empty or non-finite values.
 */
export function stdDev(values: number[]): number {
  if (values.length === 0) throw new Error('stdDev: empty sample')
  const m = mean(values)
  let sq = 0
  for (const v of values) {
    const d = v - m
    sq += d * d
  }
  return Math.sqrt(sq / values.length)
}

/**
 * Half-width of the 95% confidence interval of the mean under a normal
 * approximation: 1.96 * sd / sqrt(n). Defined as 0 for n < 2 (a single-seed
 * arm has no spread estimate; the mean is reported without an interval).
 */
export function ci95HalfWidth(values: number[]): number {
  if (values.length < 2) return 0
  return (1.96 * stdDev(values)) / Math.sqrt(values.length)
}
