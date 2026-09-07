# Architecture

## Package boundaries (dependency direction: top depends on bottom)

```
apps/simulation-cli
        │
packages/experiments · packages/psychology · packages/economy · packages/social   (domain)
        │
packages/simulation   (engine, world state, person schema, invariants)
        │
packages/core         (rng, clock, ids, events, scheduler, metrics)
        │
packages/shared       (money/integer utils, misc)
packages/test-utils   (deterministic helpers for tests)
```

Nothing may import from a package above it. All cross-domain communication flows through the event bus or explicit engine systems.

## Canonical time model (guide §4.2)

- Base tick = 1 simulated hour. `TICKS_PER_DAY = 24`, `DAYS_PER_MONTH = 30`, `MONTHS_PER_YEAR = 12`, `TICKS_PER_YEAR = 8_640`.
- Simplifications (v1, recorded): 30-day months, no weekdays, no leap years.
- Wall-clock time is forbidden in core; it appears only in CLI/benchmark/observability output.

## Canonical randomness

- All randomness flows through `createRng(seed)` from `@genesis/core` (integer-only mulberry32 + FNV-1a string seeding; `rng.fork(label)` derives independent streams).
- `Math.random()` is banned in simulation logic (invariant-audited).

## Event-driven scheduling

- Systems register `{ id, nextFireTick, run(ctx) }` with the scheduler; the engine pops the minimum tick each step. No full-population scan per tick as a regular path.
- Persons are passive data; systems batch-process them at their scheduled frequency (daily psychology/consumption, monthly salary/demography, yearly metrics).

## Person schema (canonical in `@genesis/simulation`)

Person data is plain structured state (identity + component blocks). All *logic* lives in domain packages that operate on the schema:

- `Personality` — Big Five in [0,1] (psychology package owns generation)
- `PsychologyState` — affect valence/arousal, stress [0,1], needs, wellbeing (psychology package)
- `EconomyState` — employerId, income/wealth/consumption in integer cents (economy package)
- `SocialState` — relationship ids (social package)

## Money

Integer cents everywhere (`@genesis/shared/money`). No floats for money; division uses explicit rounding policies.

## Events

`SimulationEvent { id, type, tick, actorIds, payload }` appended to an `EventLog` that keeps running aggregates (counts per type) plus a bounded recent-events window; raw history is never unbounded (guide §4.5).

## Determinism & replay

Same seed + same config ⇒ identical metrics digest. `stableStringify` (sorted keys) + FNV-1a digest provide replay verification. Iteration over maps/sets is always sorted by id.
