/** Shared clamp helper (local to avoid cross-package churn). */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
