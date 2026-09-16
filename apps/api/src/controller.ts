import { ageYears } from '@genesis/core'
import { buildIndex, populationStats, Simulation, WorldIndex } from '@genesis/simulation'
import { attainmentOf, skillOf } from '@genesis/education'
import { housingBurdenOf } from '@genesis/housing'
import { ASSIGNMENTS, SCHOOLS } from '@genesis/institutions'
import { MEDIA_PIECES } from '@genesis/media'
import { relationshipConflictOf, socialSupportOf, RelationshipGraph } from '@genesis/social'
import { fullStackSystems } from '../../simulation-cli/src/profile'

/**
 * Simulation controller (GEN-111): owns one running simulation and advances it
 * in monthly chunks on a timer, so an HTTP server stays responsive while the
 * world steps. State machine: idle → running ⇄ paused → done.
 */
export type SimState = 'idle' | 'running' | 'paused' | 'done'

export interface StartConfig {
  seed: number | string
  population: number
  years: number
  profile?: 'full' | 'minimal'
}

export interface HistorySample {
  tick: number
  stress: number | null
  wellbeing: number | null
  population: number | null
}

export interface StatusPayload {
  state: SimState
  tick: number
  targetTick: number
  progress: number
  chunkTicks: number
  digest: string | null
  error: string | null
  config: StartConfig | null
  population: ReturnType<typeof populationStats> | null
  metrics: Record<string, number> | null
  history: HistorySample[]
}

export class SimulationController {
  private sim: Simulation | null = null
  private state: SimState = 'idle'
  private targetTick = 0
  private chunkTicks = 720
  private timer: ReturnType<typeof setInterval> | null = null
  private history: HistorySample[] = []
  private config: StartConfig | null = null
  private error: string | null = null
  private digest: string | null = null
  private startedWall = 0
  private runtimeMs = 0
  private index: WorldIndex | null = null
  private indexForSim: Simulation | null = null
  /** Social graph of the active run (Roadmap D4 belief-network views). */
  private graph: import('@genesis/social').RelationshipGraph | null = null

  start(cfg: StartConfig): StatusPayload {
    if (this.state === 'running' || this.state === 'paused') {
      throw new Error('a simulation is already active — stop it first')
    }
    const { systems, graph } = fullStackSystems()
    this.graph = graph
    this.sim = Simulation.create(
      { seed: cfg.seed, populationTarget: cfg.population, years: cfg.years },
      { systems, checkInvariants: true }
    )
    this.config = cfg
    this.targetTick = Math.ceil(cfg.years * 8_640)
    this.history = []
    this.error = null
    this.digest = null
    this.index = null
    this.indexForSim = null
    this.state = 'running'
    this.startedWall = Date.now()
    this.timer = setInterval(() => this.chunk(), 15)
    return this.status()
  }

  private chunk(): void {
    if (this.sim === null || this.state !== 'running') return
    try {
      const next = Math.min(this.sim.ctx.clock.tick + this.chunkTicks, this.targetTick)
      this.sim.stepTo(next)
      this.recordSample()
      if (this.sim.ctx.clock.tick >= this.targetTick) {
        this.finish()
      }
    } catch (e) {
      this.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      this.state = 'paused' // keep world inspectable; do not silently die
      if (this.timer !== null) clearInterval(this.timer)
      this.timer = null
    }
  }

  private lastSampleValue(key: 'stress.mean' | 'wellbeing.mean' | 'population'): number | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const sample = this.history[i] as HistorySample
      const v = sample[key === 'population' ? 'population' : key === 'stress.mean' ? 'stress' : 'wellbeing']
      if (v !== null) return v
    }
    return null
  }

  private prevStats = new Map<string, { sum: number; count: number }>()

  /** Monthly-difference mean of a stats metric (red team RT3-03): true
   * within-month value instead of a diluted running average. */
  private deltaMean(m: { statsOf(name: string): { sum: number; count: number } | null }, base: string): number | null {
    const stats = m.statsOf(base)
    if (stats === null) return null
    const prev = this.prevStats.get(base)
    this.prevStats.set(base, { sum: stats.sum, count: stats.count })
    if (prev === undefined) return null
    const deltaCount = stats.count - prev.count
    if (deltaCount <= 0) return null
    return (stats.sum - prev.sum) / deltaCount
  }

  private recordSample(): void {
    if (this.sim === null) return
    const m = this.sim.ctx.metrics
    // stress/wellbeing live in the STATS namespace (metrics.record), not gauges
    // (red team RT2-02) — read via monthly differencing with last-known fallback
    const stress = this.deltaMean(m, 'stress') ?? this.lastSampleValue('stress.mean')
    const wellbeing = this.deltaMean(m, 'wellbeing') ?? this.lastSampleValue('wellbeing.mean')
    const sample: HistorySample = {
      tick: this.sim.ctx.clock.tick,
      stress,
      wellbeing,
      population: m.gaugeValue('population') > 0 ? m.gaugeValue('population') : this.lastSampleValue('population')
    }
    this.history.push(sample)
    if (this.history.length > 2_000) this.history.splice(0, this.history.length - 2_000)
  }

  private finish(): void {
    this.state = 'done'
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.runtimeMs = Date.now() - this.startedWall
    if (this.sim !== null) this.digest = this.sim.digest()
  }

  pause(): void {
    if (this.state === 'running') this.state = 'paused'
  }

  resume(): void {
    // red team RT2-09: a rejected resume must be visible to the client (400),
    // not a silent 200 with an unchanged paused state
    if (this.state === 'paused' && this.error !== null) {
      throw new Error('cannot resume: simulation halted with an error — stop and restart instead')
    }
    if (this.state === 'paused') this.state = 'running'
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.sim = null
    this.state = 'idle'
    this.history = []
    this.config = null
    this.error = null
    this.digest = null
  }

  /** Advance exactly one chunk while paused (guide §29 "step"). */
  stepOnce(): StatusPayload {
    if (this.state !== 'paused' || this.sim === null) {
      throw new Error('step requires a paused simulation')
    }
    const next = Math.min(this.sim.ctx.clock.tick + this.chunkTicks, this.targetTick)
    this.sim.stepTo(next)
    this.recordSample()
    if (this.sim.ctx.clock.tick >= this.targetTick) this.finish()
    return this.status()
  }

  setSpeed(ticksPerChunk: number): void {
    if (!Number.isInteger(ticksPerChunk) || ticksPerChunk < 24 || ticksPerChunk > 86_400) {
      throw new Error(`speed ticksPerChunk must be an integer in [24, 86400], got ${ticksPerChunk}`)
    }
    this.chunkTicks = ticksPerChunk
  }

  status(): StatusPayload {
    const sim = this.sim
    return {
      state: this.state,
      tick: sim?.ctx.clock.tick ?? 0,
      targetTick: this.targetTick,
      progress: this.targetTick === 0 ? 0 : Math.min(1, (sim?.ctx.clock.tick ?? 0) / this.targetTick),
      chunkTicks: this.chunkTicks,
      digest: this.digest,
      error: this.error,
      config: this.config,
      population: sim !== null ? populationStats(sim.ctx) : null,
      metrics: sim !== null ? sim.ctx.metrics.snapshot() : null,
      history: this.history
    }
  }

  /** Media pieces (v2 exposure memory) this person has heard. */
  private heardPieces(personId: string): string[] {
    const ctx = this.sim !== null ? this.sim.ctx : null
    if (ctx === null) return []
    const pieces = ctx.extensions.get(MEDIA_PIECES) as Map<string, { pieceId: string; heardBy: Set<string> }> | undefined
    if (pieces === undefined) return []
    const out: string[] = []
    for (const piece of pieces.values()) {
      if (piece.heardBy.has(personId)) out.push(piece.pieceId)
    }
    return out
  }

  /** Institutions side-table state for this person: school assignment,
   * overflow flag and the assigned school's quality (null = not a pupil).
   * RT6-B2: overflow pupils have NO quality reading — the virtual
   * school-overflow is not in SCHOOLS, so quality is null there (never a
   * fabricated 0). */
  private schoolAssignment(personId: string): { schoolId: string; overflow: boolean; quality: number | null } | null {
    const ctx = this.sim !== null ? this.sim.ctx : null
    if (ctx === null) return null
    const assignments = ctx.extensions.get(ASSIGNMENTS) as Map<string, { schoolId: string; isOverflow: boolean }> | undefined
    const assignment = assignments?.get(personId)
    if (assignment === undefined) return null
    const schools = ctx.extensions.get(SCHOOLS) as Map<string, { quality: number }> | undefined
    return {
      schoolId: assignment.schoolId,
      overflow: assignment.isOverflow,
      quality: assignment.isOverflow ? null : (schools?.get(assignment.schoolId)?.quality ?? null)
    }
  }

  private resolvePerson(personId: string) {
    if (this.sim === null) throw new Error('no active simulation')
    // red team RT2-08 + RT3-04: index cached per run but REBUILT when new
    // persons are born (persons.length is monotonic — a cheap staleness
    // check). RT6-B1: households mutate WITHOUT any person being born
    // (marriage creates a household, divorce moves members, GC shrinks the
    // array) — track both sizes or dossiers show stale `household: null`.
    if (
      this.index === null ||
      this.indexForSim !== this.sim ||
      this.index.personById.size !== this.sim.ctx.world.persons.length ||
      this.index.householdById.size !== this.sim.ctx.world.households.length
    ) {
      this.index = buildIndex(this.sim.ctx.world)
      this.indexForSim = this.sim
    }
    const person = this.index.personById.get(personId)
    if (person === undefined) throw new Error(`unknown person '${personId}'`)
    return person
  }

  person(personId: string): unknown {
    const person = this.resolvePerson(personId)
    const ctx = this.sim!.ctx
    const household = person.householdId !== null ? this.index!.householdById.get(person.householdId) : undefined
    const events = ctx.log
      .recentEvents()
      .filter((e) => e.actorIds.includes(personId))
      .slice(-20)
    return {
      identity: {
        id: person.id,
        sex: person.sex,
        ageYears: ageYears(person.birthTick, ctx.clock.tick),
        lifeStage: person.lifeStage,
        alive: person.alive,
        birthTick: person.birthTick
      },
      marital: { status: person.maritalStatus, partnerId: person.partnerId, motherId: person.motherId, fatherId: person.fatherId },
      household: household !== undefined ? { id: household.id, memberIds: household.memberIds } : null,
      personality: person.personality,
      psychology: person.psychology,
      economy: {
        employerId: person.economy.employerId,
        monthlyIncomeCents: person.economy.monthlyIncomeCents,
        wealthCents: person.economy.wealthCents,
        lastMonthConsumptionCents: person.economy.lastMonthConsumptionCents
      },
      social: { relationshipIds: person.social.relationshipIds },
      education: {
        attainment: attainmentOf(ctx, person.id),
        skill: skillOf(ctx, person.id)
      },
      housing: {
        burden: housingBurdenOf(ctx, person)
      },
      institutions: this.schoolAssignment(person.id),
      mediaExposure: {
        // pieces this person has heard (v2 exposure memory across all pieces)
        piecesHeard: this.heardPieces(person.id)
      },
      recentEvents: events
    }
  }

  /**
   * Life timeline (Roadmap D2): milestones derived from canonical state.
   * Exact ticks: birth, each child's birth (child birthTick), death.
   * Exact age boundaries: school enrollment (6, current assignment implies
   * it), adulthood (18), retirement (65). Marriage has NO stored tick —
   * it lands in `undated` rather than being fabricated into the sequence.
   * Recent activity (log ring window) is attached separately.
   */
  timeline(personId: string): unknown {
    const person = this.resolvePerson(personId)
    const ctx = this.sim!.ctx
    const YEAR = 8_640
    const milestones: Array<{ tick: number; type: string; detail: string; ageYears: number }> = []
    const push = (tick: number, type: string, detail: string): void => {
      milestones.push({
        tick,
        type,
        detail,
        ageYears: Math.round(((tick - person.birthTick) / YEAR) * 10) / 10
      })
    }
    push(person.birthTick, 'birth', person.id)
    const now = ctx.clock.tick
    const assignment = this.schoolAssignment(person.id)
    if (assignment !== null) push(person.birthTick + 6 * YEAR, 'school_enrolled', assignment.schoolId)
    if (now >= person.birthTick + 18 * YEAR) push(person.birthTick + 18 * YEAR, 'came_of_age', 'adult')
    for (const other of ctx.world.persons) {
      if (other.motherId === person.id || other.fatherId === person.id) {
        push(other.birthTick, 'child_born', other.id)
      }
    }
    if (now >= person.birthTick + 65 * YEAR) push(person.birthTick + 65 * YEAR, 'retired', 'senior')
    if (!person.alive && person.deathTick !== null) push(person.deathTick, 'death', '')
    milestones.sort((x, y) => x.tick - y.tick || x.type.localeCompare(y.type))
    const undated: Array<{ type: string; detail: string }> = []
    if (person.partnerId !== null) undated.push({ type: 'marriage', detail: person.partnerId })
    const recentEvents = ctx.log
      .recentEvents()
      .filter((e) => e.actorIds.includes(personId))
      .slice(-20)
    return {
      identity: { id: person.id, alive: person.alive, birthTick: person.birthTick, deathTick: person.deathTick ?? null },
      milestones,
      undated,
      recentEvents
    }
  }

  /**
   * Kinship view (Roadmap D3): the family tree around one person — parents,
   * grandparents, partners (current + deceased spouse), siblings (shared
   * parent) and children. Nodes carry alive/age; sections are disjoint lists
   * (a partner who co-parented a child appears in both — grouped views, not a
   * single graph, keeps the dependency-free dashboard render trivial).
   */
  kinship(personId: string): unknown {
    const person = this.resolvePerson(personId)
    const ctx = this.sim!.ctx
    const YEAR = 8_640
    const node = (p: { id: string; alive: boolean; birthTick: number } | undefined, relation: string) =>
      p === undefined
        ? null
        : {
            id: p.id,
            alive: p.alive,
            ageYears: Math.round(((ctx.clock.tick - p.birthTick) / YEAR) * 10) / 10,
            relation
          }
    const parentOf = (p: { motherId: string | null; fatherId: string | null }, which: 'motherId' | 'fatherId') =>
      p[which] !== null ? node(ctx.world.persons.find((x) => x.id === p[which]), which === 'motherId' ? 'mother' : 'father') : null

    const parents = [parentOf(person, 'motherId'), parentOf(person, 'fatherId')].filter((x) => x !== null)
    const grandparents: Array<Record<string, unknown>> = []
    for (const parent of [person.motherId, person.fatherId]) {
      if (parent === null) continue
      const pp = ctx.world.persons.find((x) => x.id === parent)
      if (pp === undefined) continue
      for (const gp of [parentOf(pp, 'motherId'), parentOf(pp, 'fatherId')]) {
        if (gp !== null) grandparents.push(gp)
      }
    }
    const partners: Array<Record<string, unknown>> = []
    for (const [pid, relation] of [
      [person.partnerId, 'partner'],
      [person.spouseAtDeathId, 'deceased spouse']
    ] as const) {
      if (pid === null) continue
      const p = ctx.world.persons.find((x) => x.id === pid)
      const n = node(p, relation)
      if (n !== null) partners.push(n)
    }
    const siblings: Array<Record<string, unknown>> = []
    const children: Array<Record<string, unknown>> = []
    // dead relatives stay in the tree — lineage outlives its members
    for (const other of ctx.world.persons) {
      if (other.id === person.id) continue
      const sharedParent =
        (person.motherId !== null && other.motherId === person.motherId) ||
        (person.fatherId !== null && other.fatherId === person.fatherId)
      if (sharedParent) {
        const n = node(other, 'sibling')
        if (n !== null) siblings.push(n)
      }
      if (other.motherId === person.id || other.fatherId === person.id) {
        const n = node(other, 'child')
        if (n !== null) children.push(n)
      }
    }
    return {
      root: node(person, 'root'),
      sections: { parents, grandparents, partners, siblings, children }
    }
  }

  /**
   * Belief network slice around one person (Roadmap D4): their heard pieces
   * (origin + how many believe each) and per-neighbor hearing/belief stats
   * sampled from the social graph (capped 30 neighbors). Requires a run
   * started in-session (the graph and media side-table are live state).
   */
  beliefNetwork(personId: string): unknown {
    const person = this.resolvePerson(personId)
    const ctx = this.sim!.ctx
    const pieces = ctx.extensions.get(MEDIA_PIECES) as
      | Map<string, { pieceId: string; origin: string; heardBy: Set<string>; believedBy: Set<string> }>
      | undefined
    const heard: Array<Record<string, unknown>> = []
    const neighborBeliefs = new Map<string, { heard: number; believed: number }>()
    const neighbors = this.graph !== null ? new Set(this.graph.neighborsOf(personId)) : new Set<string>()
    if (pieces !== undefined) {
      for (const piece of pieces.values()) {
        if (piece.heardBy.has(personId)) {
          heard.push({
            pieceId: piece.pieceId,
            origin: piece.origin,
            believedCount: piece.believedBy.size,
            heardCount: piece.heardBy.size
          })
        }
        for (const neighbor of neighbors) {
          if (!piece.heardBy.has(neighbor)) continue
          const acc = neighborBeliefs.get(neighbor) ?? { heard: 0, believed: 0 }
          acc.heard++
          if (piece.believedBy.has(neighbor)) acc.believed++
          neighborBeliefs.set(neighbor, acc)
        }
      }
    }
    const ranked = [...neighborBeliefs.entries()]
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((x, y) => y.believed - x.believed || y.heard - x.heard || x.id.localeCompare(y.id))
      .slice(0, 30)
    return {
      person: { id: person.id, alive: person.alive },
      graphAvailable: this.graph !== null,
      piecesHeard: heard.length,
      heard,
      neighbors: ranked
    }
  }

  events(limit: number): unknown[] {
    if (this.sim === null) throw new Error('no active simulation')
    const capped = Math.max(1, Math.min(500, Math.floor(limit) || 50))
    const all = this.sim.ctx.log.recentEvents()
    return all.slice(-capped)
  }

  exportManifest(): Record<string, unknown> {
    if (this.sim === null) throw new Error('no active simulation')
    const done = this.state === 'done'
    return {
      config: this.config,
      tick: this.sim.ctx.clock.tick,
      state: this.state,
      // red team RT2-09: distinguish a final archive digest from an
      // in-progress intermediate digest
      final: done,
      runtimeMs: done ? this.runtimeMs : Date.now() - this.startedWall,
      digest: this.digest,
      population: populationStats(this.sim.ctx),
      metrics: this.sim.ctx.metrics.snapshot(),
      events: this.sim.ctx.log.stats()
    }
  }
}
