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
  /** Source trust (v4): official newspaper pieces convert at full base;
   * rumor pieces (believer gossip, neighborhood-only) at RUMOR_TRUST × base. */
  origin: 'official' | 'rumor'
  heardCount: number
  /** Per-person exposure memory (v2, red-team-proof design): who heard this
   * piece. Bounded by population; enables per-person belief modelling later. */
  heardBy: Set<string>
  /** v2 belief layer: who BELIEVES the piece (subset of heardBy). Conversion
   * at hearing (flat base + v3 social reinforcement); beliefs lapse in the
   * per-cycle decay pass (v3) while heardBy keeps the exposure memory. */
  believedBy: Set<string>
}

export function ensurePieces(ctx: SimContext): Map<string, MediaPiece> {
  const existing = ctx.extensions.get(MEDIA_PIECES)
  if (existing instanceof Map) return existing as Map<string, MediaPiece>
  const created = new Map<string, MediaPiece>()
  ctx.extensions.set(MEDIA_PIECES, created)
  return created
}

/** Publication cadence: one piece every 4 weeks (672 ticks; 168 ticks/week). */
export const PUBLISH_EVERY_TICKS = 672

/** Hearing probability per publication cycle (4 weeks) per person, scaled by
 * tie count (degree). */
export function hearingProbability(tieCount: number): number {
  // more connections → more exposure; saturates at 0.5 for 20+ ties
  return clamp01(0.05 + 0.02 * Math.min(20, tieCount))
}

/** Probability that hearing converts to belief (v2 baseline: flat, no source
 * trust). Social reinforcement (v3) lifts this per hearer by
 * BELIEF_SOCIAL_REINFORCEMENT × believing-neighbor share. */
export const BELIEF_CONVERSION_PROB = 0.6
/** Per-publication-cycle (4-week) lapse probability applied to each belief in
 * the decay pass that runs once per media fire — every 4 weeks, NOT weekly
 * (RT6-A1: name kept for EXP-022 continuity; the EFFECTIVE weekly lapse rate
 * is ≈0.5%, not 2%). Decay enables rumor persistence/decay dynamics
 * (EXP-022 v3). */
export const BELIEF_DECAY_PROB_PER_WEEK = 0.02
/** Social reinforcement (v3): conversion bonus at a believing-neighbor share
 * of 1. Wired together with the neighbors dep; 0 or missing dep = flat v2
 * conversion. */
export const BELIEF_SOCIAL_REINFORCEMENT = 0.25
/** Source trust (v4): rumor pieces convert at RUMOR_TRUST × the official base
 * — hearing a rumor from a neighbor is less authoritative than the newspaper. */
export const RUMOR_TRUST = 0.5
/** Per-cycle probability that one believer gossips the newest piece into a
 * neighborhood rumor (requires the neighbors dep; no wiring = no rumors). */
export const RUMOR_GENESIS_PROB_PER_CYCLE = 0.25

/** Conversion probability given the share of a hearer's neighbors that
 * already hold beliefs (any piece — neighborhood credibility, not piece-level
 * contagion). Clamped to [0,1]; pure so tests can mutation-kill the formula. */
export function conversionProbability(base: number, reinforcement: number, believingNeighborShare: number): number {
  return clamp01(base + reinforcement * believingNeighborShare)
}

/** Share of a hearer's neighbors that hold at least one belief (any piece —
 * neighborhood credibility, not piece-level contagion). Pure: tests pin the
 * denominator and the any-piece semantics (RT6-A2). */
export function believingNeighborShare(neighbors: string[], believingCount: Map<string, number>): number {
  if (neighbors.length === 0) return 0
  let believing = 0
  for (const n of neighbors) {
    if ((believingCount.get(n) ?? 0) > 0) believing++
  }
  return believing / neighbors.length
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Publication-cycle media system (priority 16 — after social(15), so tie
 * counts are fresh; fires every PUBLISH_EVERY_TICKS = 4 weeks): publishes a
 * piece, then spreads hearing across alive persons. Hearing count per piece
 * grows with the person's tie count (degree correlates with exposure).
 * Belief conversion (v3) is socially reinforced: hearers whose neighbors
 * already hold beliefs convert more readily (snapshot taken before the
 * sweep — no within-piece order effects). Deterministic: array-order sweep
 * over ONE rng stream forked per fire tick (fork(label) derivation keeps
 * replays stable; not per-person forks — RT6-A6).
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
    // conversions must not leak into later hearers' reinforcement input.
    // RT6-A3: only ALIVE believers count — a dead believer's frozen belief
    // must not reinforce the living. social's weekly edge cleanup normally
    // hides the dead from neighborsOf, but that cadence coupling is implicit;
    // gating here makes the semantics explicit.
    const byId = new Map(ctx.world.persons.map((p) => [p.id, p]))
    const believingNeighbors = new Map<string, number>()
    if (neighborsOf !== undefined && reinforcement > 0) {
      for (const piece of pieces.values()) {
        for (const believer of piece.believedBy) {
          const bp = byId.get(believer)
          if (bp === undefined || !bp.alive) continue
          believingNeighbors.set(believer, (believingNeighbors.get(believer) ?? 0) + 1)
        }
      }
    }

    // publish
    const pieceId = ctx.ids.next('piece')
    pieces.set(pieceId, {
      pieceId,
      originTick: tick,
      origin: 'official',
      heardCount: 0,
      heardBy: new Set(),
      believedBy: new Set()
    })
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
        // (pieces are born fresh every fire — no dedup branch needed; RT6-A7)
        newest.heardBy.add(person.id)
        newest.heardCount++
        ctx.metrics.increment('media_hearings_total')
        // belief conversion (v2 base + v3 social reinforcement): believed
        // subset ⊆ heard subset; decay handled in the per-cycle pass
        let believingShare = 0
        if (neighborsOf !== undefined && reinforcement > 0) {
          believingShare = believingNeighborShare(neighborsOf(ctx, person.id), believingNeighbors)
          if (believingShare > 0) ctx.metrics.increment('media_reinforced_hearings')
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

    // per-cycle belief-decay pass (EXP-022 v3): beliefs lapse at
    // BELIEF_DECAY_PROB_PER_WEEK each media fire (every 4 weeks — see the
    // constant's doc for the effective weekly rate) — removed from believedBy
    // (heardBy keeps the exposure memory). Reinforcement happens via
    // re-exposure on new pieces.
    const decayRng = ctx.rng.fork(`media.decay:${tick}`)
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

    // rumor genesis (source trust v4): with a small per-cycle probability one
    // alive believer gossips the newest piece into a NEIGHBORHOOD rumor at
    // discounted trust (RUMOR_TRUST × base conversion). Requires the
    // neighbors dep — no wiring, no rumors. Share reuses the pre-sweep
    // snapshot (cycle-start neighborhood credibility).
    if (neighborsOf !== undefined && rng.bool(RUMOR_GENESIS_PROB_PER_CYCLE)) {
      const believers = [...newest.believedBy].filter((id) => byId.get(id)?.alive === true)
      if (believers.length > 0) {
        const gossip = believers[Math.floor(rng.next() * believers.length)]
        const rumorId = ctx.ids.next('piece')
        const rumor = {
          pieceId: rumorId,
          originTick: tick,
          origin: 'rumor' as const,
          heardCount: 0,
          heardBy: new Set<string>(),
          believedBy: new Set<string>()
        }
        pieces.set(rumorId, rumor)
        ctx.metrics.increment('media_rumors_spawned')
        ctx.events.emit({
          id: ctx.ids.next('event'),
          type: 'media.published',
          tick,
          actorIds: [],
          payload: { pieceId: rumorId, origin: 'rumor' }
        })
        for (const neighbor of neighborsOf(ctx, gossip)) {
          const np = byId.get(neighbor)
          if (np === undefined || !np.alive) continue
          const degree = tieCounts?.get(neighbor) ?? 0
          if (!rng.bool(hearingProbability(degree))) continue
          rumor.heardBy.add(neighbor)
          rumor.heardCount++
          ctx.metrics.increment('media_hearings_total')
          const share = believingNeighborShare(neighborsOf(ctx, neighbor), believingNeighbors)
          if (rng.bool(conversionProbability(BELIEF_CONVERSION_PROB * RUMOR_TRUST, reinforcement, share))) {
            rumor.believedBy.add(neighbor)
            ctx.metrics.increment('media_beliefs_total')
          }
          ctx.events.emit({
            id: ctx.ids.next('event'),
            type: 'information.heard',
            tick,
            actorIds: [neighbor],
            payload: { pieceId: rumorId, origin: 'rumor' }
          })
        }
      }
    }
  }
})
