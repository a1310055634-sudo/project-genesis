import { ageYears } from '@genesis/core'
import { buildIndex, populationStats, Simulation, WorldIndex } from '@genesis/simulation'
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

  start(cfg: StartConfig): StatusPayload {
    if (this.state === 'running' || this.state === 'paused') {
      throw new Error('a simulation is already active — stop it first')
    }
    const { systems } = fullStackSystems()
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

  person(personId: string): unknown {
    if (this.sim === null) throw new Error('no active simulation')
    // red team RT2-08 + RT3-04: index cached per run but REBUILT when new
    // persons are born (persons.length is monotonic — a cheap staleness check)
    if (this.index === null || this.indexForSim !== this.sim || this.index.personById.size !== this.sim.ctx.world.persons.length) {
      this.index = buildIndex(this.sim.ctx.world)
      this.indexForSim = this.sim
    }
    const person = this.index.personById.get(personId)
    if (person === undefined) throw new Error(`unknown person '${personId}'`)
    const household = person.householdId !== null ? this.index.householdById.get(person.householdId) : undefined
    const events = this.sim.ctx.log
      .recentEvents()
      .filter((e) => e.actorIds.includes(personId))
      .slice(-20)
    return {
      identity: {
        id: person.id,
        sex: person.sex,
        ageYears: ageYears(person.birthTick, this.sim.ctx.clock.tick),
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
      recentEvents: events
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
