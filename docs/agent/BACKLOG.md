# Backlog

Format per guide §19. Ready Queue target: 40–120 well-defined tasks (HT-11). Quality gate: never pad the queue without Acceptance (HT-11).

## Wave 1 — World Foundation (P1)

### GEN-001 Bootstrap monorepo — DONE (2026-09-08)
### GEN-003 Seeded RNG — DONE (2026-09-08)
### GEN-004 Simulation clock — DONE (2026-09-08)
### GEN-006 Event bus + log — DONE (2026-09-08)
### GEN-008 Entity IDs — DONE (2026-09-08)
### GEN-012 Metrics registry — DONE (2026-09-08)
### GEN-005 Event-driven scheduler — DONE (2026-09-08)

### GEN-009 World state + Person schema
Priority: P1 · Domain: simulation · Parallel-safe: no (canonical schema)
Goal: WorldState container, Person/Household/Employer types with component blocks, registries.
Acceptance: typecheck strict; factory + generator tests; ids unique; references resolve.

### GEN-024 Population generator
Priority: P1 · Domain: simulation · Depends on: GEN-009
Goal: 10,000 residents with age/sex distribution, households (single/couple/parent-child), employers, job assignment.
Acceptance: deterministic under seed; household integrity invariants pass; 10k in < 5s.

### GEN-010 Simulation CLI
Priority: P1 · Domain: platform · Depends on: GEN-009
Goal: `npm run sim -- --seed --population --years [--out]`; run manifest per guide §28.
Acceptance: 10k × 1y runs; manifest includes seed/configHash/runtime/population/eventCount/metrics.

### GEN-011 Deterministic replay test
Priority: P1 · Domain: quality · Depends on: GEN-009
Goal: same seed+config → identical metrics digest; different seed → different digest.
Acceptance: property holds for seeds 42/7/2026; digest stable across two runs in-process.

### GEN-132 Invariant suite
Priority: P1 · Domain: quality · Depends on: GEN-009
Goal: guide §27 invariants checked monthly in-sim + in tests.
Acceptance: violations throw with run/seed/tick/entity context (§28).

### GEN-134 Benchmark harness
Priority: P2 · Domain: quality
Goal: `npm run bench` measuring 1k×1y and 10k×1y runtime/memory; append results to benchmarks/RESULTS.md.
Acceptance: records runtime, peak RSS, events/sec.

## Wave 2 — Psychology / Economy / Social (P2–P3)

### GEN-030..039 Psychology package (contract in ARCHITECTURE.md)
Priority: P2 · Domain: psychology · Parallel-safe: yes (packages/psychology only)
Goal: Big Five generation, affect (valence/arousal + decay + mood inertia), stress (weighted-delta model, clamped [0,1], neuroticism moderation, social-support buffering), needs (rest/social/esteem), wellbeing.
Acceptance: bounds under adversarial inputs; monotonic scenario (more strain ⇒ ≥ stress); moderator scenario (support buffers); recovery scenario; determinism under fixed seed.

### GEN-090..099 Economy package
Priority: P2 · Domain: economy · Parallel-safe: yes (packages/economy only)
Goal: employers with job slots, hiring/unemployment search, monthly payroll, daily consumption, wealth accounting in integer cents.
Acceptance: wealth conservation on transfers (no money created/destroyed except documented flows); finite values; determinism; employment rate metric.

### GEN-050..053 Social package
Priority: P2 · Domain: social · Parallel-safe: yes (packages/social only)
Goal: relationship graph (edge store keyed by sorted pair), interaction engine v1, acquaintance/friendship formation influenced by Big Five + proximity.
Acceptance: endpoints exist; no duplicate edges; deterministic; graph metrics (edges, mean degree, isolation rate).

### GEN-115 Integration: wire psychology+social+economy systems into engine CLI profile
Priority: P2 · Depends on: the three packages above · Parallel-safe: no
Goal: default system composition; full-suite green; 10k×10y smoke.

## Quality / later (P3–P5)
- GEN-133 Property tests (money, rng, scheduler, graph) — fast-check-style generators hand-rolled (no new deps)
- GEN-150+ Experiment framework (multi-seed runner, CSV export, aggregation)
- GEN-110/112 API + dashboard reading real run state
- HT-32 morning audit tasks (5 reviewers)
- Fuzz/scenario pack: extreme unemployment, very old population, tiny/huge populations
- Cross-platform determinism audit (IDLE-029)
