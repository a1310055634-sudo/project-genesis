import { ageYears } from '@genesis/core'
import { populationStats, Simulation } from '@genesis/simulation'
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

  private recordSample(): void {
    if (this.sim === null) return
    const m = this.sim.ctx.metrics
    const sample: HistorySample = {
      tick: this.sim.ctx.clock.tick,
      stress: m.gaugeValue('stress.mean') > 0 ? m.gaugeValue('stress.mean') : this.lastSampleValue('stress.mean'),
      wellbeing:
        m.gaugeValue('wellbeing.mean') > 0 ? m.gaugeValue('wellbeing.mean') : this.lastSampleValue('wellbeing.mean'),
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
    if (this.state === 'paused' && this.error === null) this.state = 'running'
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
    const person = this.sim.ctx.world.persons.find((p) => p.id === personId)
    if (person === undefined) throw new Error(`unknown person '${personId}'`)
    const household =
      person.householdId !== null ? this.sim.ctx.world.households.find((h) => h.id === person.householdId) : undefined
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
    return {
      config: this.config,
      tick: this.sim.ctx.clock.tick,
      state: this.state,
      runtimeMs: this.state === 'done' ? this.runtimeMs : Date.now() - this.startedWall,
      digest: this.digest ?? this.sim.digest(),
      population: populationStats(this.sim.ctx),
      metrics: this.sim.ctx.metrics.snapshot(),
      events: this.sim.ctx.log.stats()
    }
  }
}
