/**
 * Integer money utilities.
 *
 * Rule (guide §4.5, day-one constraint): money is ALWAYS integer minor units
 * ("cents"). Floating point money is a P0 violation. All arithmetic goes
 * through these helpers so invariants have a single place to check.
 */

export type Cents = number

/** Tag a raw integer as money. Throws on non-integers (incl. NaN/Infinity). */
export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new Error(`money must be an integer, got: ${value}`)
  }
  return value
}

export function addMoney(a: Cents, b: Cents): Cents {
  return cents(a + b)
}

export function subMoney(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

/** Multiply by a non-negative factor with explicit rounding policy. */
export function scaleMoney(a: Cents, factor: number, round: 'floor' | 'ceil' | 'nearest' = 'nearest'): Cents {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error(`money factor must be a finite non-negative number, got: ${factor}`)
  }
  const raw = a * factor
  switch (round) {
    case 'floor':
      return cents(Math.floor(raw))
    case 'ceil':
      return cents(Math.ceil(raw))
    case 'nearest':
      return cents(Math.round(raw))
  }
}

/** Split evenly across n parts; remainder (positive or negative) goes to the first parts. Sum(parts) === a. */
export function splitMoney(a: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`split count must be a positive integer, got: ${n}`)
  }
  const base = Math.trunc(a / n)
  const remainder = a - base * n
  const parts: Cents[] = []
  for (let i = 0; i < n; i++) {
    if (remainder > 0 && i < remainder) parts.push(cents(base + 1))
    else if (remainder < 0 && i < -remainder) parts.push(cents(base - 1))
    else parts.push(cents(base))
  }
  return parts
}

export function assertMoneyFinite(a: Cents, context: string): void {
  if (!Number.isFinite(a) || !Number.isInteger(a)) {
    throw new Error(`money invariant violated (${context}): ${a}`)
  }
}

export function formatMoney(a: Cents): string {
  const sign = a < 0 ? '-' : ''
  const abs = Math.abs(a)
  return `${sign}$${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
