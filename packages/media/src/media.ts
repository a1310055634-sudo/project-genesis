/**
 * Media domain (HT-12 Media, EXP-021/022): a city newspaper publishes pieces
 * on a schedule; information spreads through the social network — hearing
 * probability scales with each person's tie count.
 *
 * Side-table design (education/housing pattern): 'media.pieces' lives in
 * ctx.extensions. Each piece carries two per-person sets (v2): heardBy
 * (exposure memory, bounds hearing dedup) and believedBy (belief layer,
 * subset of heardBy; conversion at hearing, weekly lapse since EXP-022 v3).
 * The newspaper remains a single exogenous source — multi-source trust is
 * future work (belief v3 extension).
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

/** Probability that hearing converts to belief (v2 baseline: flat, no source
 * trust). Social reinforcement (v3) lifts this per hearer by
 * BELIEF_SOCIAL_REINFORCEMENT × believing-neighbor share. */
export const BELIEF_CONVERSION_PROB = 0.6
/** Per-week probability that an unreinforced belief decays (EXP-022 v3:
 * belief is no longer permanent — decay enables rumor persistence/decay
 * dynamics). Low rate: ~2% of believers lapse per week. */
export const BELIEF_DECAY_PROB_PER_WEEK = 0.02
/** Social reinforcement (v3): conversion bonus at a believing-neighbor share
 * of 1. Wired together with the neighbors dep; 0 or missing dep = flat v2
 * conversion. */
export const BELIEF_SOCIAL_REINFORCEMENT = 0.25

/** Conversion probability given the share of a hearer's neighbors that
 * already hold beliefs (any piece — neighborhood credibility, not piece-level
 * contagion). Clamped to [0,1]; pure so tests can mutation-kill the formula. */
export function conversionProbability(base: number, reinforcement: number, believingNeighborShare: number): number {
  return clamp01(base + reinforcement * believingNeighborShare)
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Weekly media system (priority 16 — after social(15), so tie counts are
 * fresh): publishes a piece every PUBLISH_EVERY_TICKS, then spreads hearing
 * across alive persons. Hearing count per piece grows with the person's tie
 * count (degree correlates with exposure). Belief conversion (v3) is socially
 * reinforced: hearers whose neighbors already hold beliefs convert more
 * readily (snapshot taken before the sweep — no within-piece order effects).
 * Deterministic: array-order sweep, per-person rng fork.
 *
 * deps are injected by the composition root (domain→domain decoupling):
 * - tieCounts drives exposure; without it, hearing falls back to flat baseline.
 * - neighbors + reinforcement drive social reinforcement of conversion;
 *   without them, conversion stays at the flat v2 baseline.
 */
export const mediaSystem = (deps?: {
  tieCounts?: (ctx: SimContext) => Map<string, number>
  neighbors?: (ctx: SimContext, personId: string) => string[]
  reinforcement?: number
}): GenesisSystem => ({
  id: 'media',
  priority: 16,
  nextFireTick: (ctx) => (Math.floor(ctx.tick() / PUBLISH_EVERY_TICKS) + 1) * PUBLISH_EVERY_TICKS,
  run(ctx: SimContext) {
    const tick = ctx.tick()
    const rng = ctx.rng.fork(`media:${tick}`)
    const pieces = ensurePieces(ctx)
    const tieCounts = deps?.tieCounts?.(ctx)
    const neighborsOf = deps?.neighbors
    const reinforcement = deps?.reinforcement ?? 0

    // pre-sweep snapshot of who holds beliefs (any piece): the sweep's own
    // conversions must not leak into later hearers' reinforcement input
    const believingNeighbors = new Map<string, number>()
    if (neighborsOf !== undefined && reinforcement > 0) {
      for (const piece of pieces.values()) {
        for (const believer of piece.believedBy) {
          believingNeighbors.set(believer, (believingNeighbors.get(believer) ?? 0) + 1)
        }
      }
    }

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
        // belief conversion (v2 base + v3 social reinforcement): believed
        // subset ⊆ heard subset; decay handled in the weekly pass
        let believingShare = 0
        if (neighborsOf !== undefined && reinforcement > 0) {
            const neighbors = neighborsOf(ctx, person.id)
          if (neighbors.length > 0) {
            let believing = 0
            for (const n of neighbors) {
              if ((believingNeighbors.get(n) ?? 0) > 0) believing++
            }
            believingShare = believing / neighbors.length
            if (believingShare > 0) ctx.metrics.increment('media_reinforced_hearings')
          }
        }
        if (rng.bool(conversionProbability(BELIEF_CONVERSION_PROB, reinforcement, believingShare))) {
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

    // weekly belief-decay pass (EXP-022 v3): unreinforced beliefs lapse at
    // BELIEF_DECAY_PROB_PER_WEEK — removed from believedBy (heardBy keeps the
    // exposure memory). Reinforcement happens via re-exposure on new pieces.
    const decayRng = ctx.rng.fork(`media.decay:${tick}`)
    const byId = new Map(ctx.world.persons.map((p) => [p.id, p]))
    for (const piece of pieces.values()) {
      for (const believer of [...piece.believedBy]) {
        const person = byId.get(believer)
        if (person === undefined || !person.alive) continue // dead believers frozen
        if (decayRng.bool(BELIEF_DECAY_PROB_PER_WEEK)) {
          piece.believedBy.delete(believer)
          ctx.metrics.increment('media_beliefs_lapsed')
        }
      }
    }

    ctx.metrics.gauge('media_pieces', pieces.size)
    ctx.metrics.gauge('media_last_piece_heard', newest.heardCount)
    ctx.metrics.gauge('media_last_piece_believed', newest.believedBy.size)
  }
})
