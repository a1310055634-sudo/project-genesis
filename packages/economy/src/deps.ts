import { SimContext } from '@genesis/simulation'

/**
 * Injected domain hooks (GEN-151b / HT-12): the education skill side table
 * feeds wage pricing through this callback, so @genesis/economy never imports
 * @genesis/education directly (domains couple only via injected interfaces —
 * same pattern as @genesis/family's FamilyDeps).
 */
export interface EconomyDeps {
  /** Returns a skill wage multiplier in [0.5, 2]; the economy side still
   * clamps defensively. Default 1.0. */
  wageSkillMultiplier?: (ctx: SimContext, personId: string) => number
}
