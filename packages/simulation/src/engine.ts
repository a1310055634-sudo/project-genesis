import { createRng, Rng, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@genesis/core'
import { fnv1a, stableStringify, digest } from '@genesis/shared'
import { normalizeConfig, SimulationConfig, configHash } from './config'
import { createContext, buildIndex, GenesisSystem, SimContext } from './context'
import { generatePopulation } from './population'
import { PersonInitializers } from './factory'
import { checkInvariants } from './invariants'
import { WorldState } from './types'

/**
 * Simulation engine (Wave 1): owns the world, drives the scheduler, runs the
 * built-in monthly invariant check, and produces deterministic run digests.
 *
 * Replay guarantee (guide §2.1): same seed + same config ⇒ identical digest.
 */
export interface SimulationOptions {
  systems?: GenesisSystem[]
  initializers?: PersonInitializers
  /** Run invariants monthly (default true). */
  checkInvariants?: boolean
}

export class Simulation {
  readonly ctx: SimContext

  private constructor(readonly config: SimulationConfig, options: SimulationOptions) {
    const world: WorldState = { seed: 0, persons: [], households: [], employers: [] }
    // numeric seed derived from config so string seeds are reproducible
    const numericSeed = fnv1a(`${config.seed}`) ^ fnv1a(configHash(config))
    world.seed = numericSeed
    const rng: Rng = createRng(numericSeed)
    this.ctx = createContext(config, world, rng)
    generatePopulation(this.ctx, options.initializers)

    const systems = [...(options.systems ?? [])]
    if (options.checkInvariants !== false) {
      systems.push({
        id: 'invariants',
        priority: -100,
        nextFireTick: (ctx) => (Math.floor(ctx.tick() / TICKS_PER_MONTH) + 1) * TICKS_PER_MONTH,
        run: (ctx) => {
          const stats = checkInvariants(ctx.world, ctx.tick(), world.seed)
          ctx.metrics.gauge('invariant_checks_last', stats.checks)
        }
      })
    }
    // register all systems at tick 0
    const ctx0 = this.contextAt(0)
    for (const system of systems) {
      this.ctx.scheduler.register(system, ctx0)
    }
  }

  static create(partialConfig: Partial<SimulationConfig> = {}, options: SimulationOptions = {}): Simulation {
    const config = normalizeConfig(partialConfig)
    return new Simulation(config, options)
  }

  private contextAt(tick: number): SimContext {
    this.ctx.clock.setTick(tick)
    return this.ctx
  }

  /** Advance the simulation to an absolute tick (never backward). */
  stepTo(targetTick: number): void {
    const clock = this.ctx.clock
    for (;;) {
      const next = this.ctx.scheduler.peekNextTick()
      if (next === null || next >= targetTick) {
        clock.setTick(targetTick)
        return
      }
      this.ctx.scheduler.fireDue(targetTick, (tick) => this.contextAt(tick))
    }
  }

  /** Run N more years from the current position. */
  runYears(years: number): void {
    const target = this.ctx.clock.tick + Math.ceil(years * TICKS_PER_YEAR)
    this.stepTo(target)
  }

  /** Run from tick 0 (no-op after generation) through config.years. */
  run(years?: number): void {
    const yearsToRun = years ?? this.config.years
    this.stepTo(Math.ceil(yearsToRun * TICKS_PER_YEAR))
    const stats = checkInvariants(this.ctx.world, this.ctx.clock.tick, this.ctx.world.seed)
    this.ctx.metrics.gauge('invariant_checks_last', stats.checks)
  }

  /**
   * Deterministic world digest: canonical snapshot + metrics. Two runs with
   * the same seed/config MUST produce the same value (GEN-011).
   */
  digest(): string {
    const world = this.ctx.world
    const index = buildIndex(world)
    const snapshot = {
      seed: world.seed,
      tick: this.ctx.clock.tick,
      issuerFingerprint: this.ctx.ids.fingerprint(),
      persons: world.persons.map((p) => ({
        id: p.id,
        sex: p.sex,
        birthTick: p.birthTick,
        alive: p.alive,
        deathTick: p.deathTick,
        lifeStage: p.lifeStage,
        householdId: p.householdId,
        employerId: p.economy.employerId,
        wealthCents: p.economy.wealthCents,
        monthlyIncomeCents: p.economy.monthlyIncomeCents,
        stress: round6(p.psychology.stress),
        wellbeing: round6(p.psychology.wellbeing),
        affectValence: round6(p.psychology.affectValence),
        personality: {
          o: round6(p.personality.openness),
          c: round6(p.personality.conscientiousness),
          e: round6(p.personality.extraversion),
          a: round6(p.personality.agreeableness),
          n: round6(p.personality.neuroticism)
        }
      })),
      households: world.households.map((h) => ({ id: h.id, memberIds: h.memberIds })),
      employers: world.employers.map((e) => ({ id: e.id, filledSlots: e.filledSlots, wage: e.monthlyWageCents })),
      metrics: this.ctx.metrics.snapshot(),
      eventStats: this.ctx.log.stats(),
      indexSizes: {
        persons: index.personById.size,
        households: index.householdById.size,
        employers: index.employerById.size
      }
    }
    return digest(snapshot)
  }

  /** Full canonical snapshot as a stable JSON string (for exports). */
  snapshotJson(): string {
    const snapshot = {
      seed: this.ctx.config.seed,
      configHash: configHash(this.ctx.config),
      tick: this.ctx.clock.tick,
      persons: this.ctx.world.persons.length,
      metrics: this.ctx.metrics.snapshot(),
      events: this.ctx.log.stats(),
      digest: this.digest()
    }
    return stableStringify(snapshot)
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
