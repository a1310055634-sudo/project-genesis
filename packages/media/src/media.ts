/**
 * Media domain (HT-12 Media, EXP-021/022 prerequisites): a city newspaper
 * publishes pieces on a schedule; information spreads through the social
 * network — hearing probability scales with each person's tie count.
 *
 * Side-table design (education/housing pattern): 'media.pieces' lives in
 * ctx.extensions. v1 simplifications (recorded):
 * - pieces are topics with a spread COUNT only; per-person hearing memory
 *   (who heard what) is not tracked (needed for rumor belief modelling later);
 * - the newspaper is a single exogenous source (no competing outlets).
 */

import { GenesisSystem, SimContext } from '@genesis/simulation'

export const MEDIA_PIECES = 'media.pieces'

export interface MediaPiece {
  pieceId: string
  originTick: number
  heardCount: number
  /** Per-person exposure memory (v2, red-team-proof design): who heard this
   * piece. Bounded by population; enables per-person belief modelling later. */
  heardBy: Set<string>
  /** v2 belief layer: who BELIEVES the piece (subset of heardBy). Hearing
   * converts to belief with flat probability; belief never decays in v1
   * (belief-decay is the EXP-022 v3 follow-up). */
  believedBy: Set<string>
}

export function ensurePieces(ctx: SimContext): Map<string, MediaPiece> {
  const existing = ctx.extensions.get(MEDIA_PIECES)
  if (existing instanceof Map) return existing as Map<string, MediaPiece>
  const created = new Map<string, MediaPiece>()
  ctx.extensions.set(MEDIA_PIECES, created)
  return created
}

/** Weekly publication cadence (every 4 weeks). */
export const PUBLISH_EVERY_TICKS = 672

/** Hearing probability per week per person, scaled by tie count (degree). */
export function hearingProbability(tieCount: number): number {
  // more connections → more exposure; saturates at 0.5 for 20+ ties
  return clamp01(0.05 + 0.02 * Math.min(20, tieCount))
}

/** Probability that hearing converts to belief (v1: flat, no source trust). */
export const BELIEF_CONVERSION_PROB = 0.6

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Weekly media system (priority 16 — after social(15), so tie counts are
 * fresh): publishes a piece every PUBLISH_EVERY_TICKS, then spreads hearing
 * across alive persons. Hearing count per piece grows with the person's tie
 * count (degree correlates with exposure). Deterministic: array-order sweep,
 * per-person rng fork.
 *
 * deps.graph is injected by the composition root (domain→domain decoupling);
 * without it, hearing falls back to a flat baseline probability.
 */
export const mediaSystem = (deps?: { tieCounts?: (ctx: SimContext) => Map<string, number> }): GenesisSystem => ({
  id: 'media',
  priority: 16,
  nextFireTick: (ctx) => (Math.floor(ctx.tick() / PUBLISH_EVERY_TICKS) + 1) * PUBLISH_EVERY_TICKS,
  run(ctx: SimContext) {
    const tick = ctx.tick()
    const rng = ctx.rng.fork(`media:${tick}`)
    const pieces = ensurePieces(ctx)
    const tieCounts = deps?.tieCounts?.(ctx)

    // publish
    const pieceId = ctx.ids.next('piece')
    pieces.set(pieceId, { pieceId, originTick: tick, heardCount: 0, heardBy: new Set(), believedBy: new Set() })
    ctx.events.emit({
      id: ctx.ids.next('event'),
      type: 'media.published',
      tick,
      actorIds: [],
      payload: { pieceId }
    })

    // spread: everyone hears the newest piece with tie-scaled probability
    const newest = pieces.get(pieceId) as MediaPiece
    for (const person of ctx.world.persons) {
      if (!person.alive) continue
      const degree = tieCounts?.get(person.id) ?? 0
      if (rng.bool(hearingProbability(degree))) {
        // per-person exposure memory: a person hears each piece only once
        if (newest.heardBy.has(person.id)) continue
        newest.heardBy.add(person.id)
        newest.heardCount++
        ctx.metrics.increment('media_hearings_total')
        // belief conversion (v2): hearing converts at BELIEF_CONVERSION_PROB;
        // believed subset ⊆ heard subset, belief never decays in v1
        if (rng.bool(BELIEF_CONVERSION_PROB)) {
          newest.believedBy.add(person.id)
          ctx.metrics.increment('media_beliefs_total')
        }
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'information.heard',
          tick,
          actorIds: [person.id],
          payload: { pieceId }
        })
      }
    }

    ctx.metrics.gauge('media_pieces', pieces.size)
    ctx.metrics.gauge('media_last_piece_heard', newest.heardCount)
    ctx.metrics.gauge('media_last_piece_believed', newest.believedBy.size)
  }
})
