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

## Wave 3 — Relationships & Family (P2–P3) — IN PROGRESS

### GEN-055/056/057 Marriage & divorce & widowhood — DONE (family package, batch 4)
### GEN-075 Inheritance hooks — DONE (spouse 50% + children split, batch 5)
### RT1-01 Parenthood chain — DONE (motherId/fatherId, married-couple births, batch 5)

### NEXT Wave 3.2 (parallel-safe candidates)
- GEN-053b Extraversion → interaction-frequency pathway — DONE (batch 9; EXP-006 flipped to +30% edges, CI95 disjoint)
- GEN-151b Experiment metrics: time-sampled series (per-month snapshots) + rehire friction option — DONE (watchdog session: sampleMetrics opt + sampler system + sampleSummarize windows + rehireCooldownMonths knob; EXP-001 direction flipped positive)
- GEN-058 Relationship conflict → divorce coupling depth — DONE (batch 11: stress→conflict pathway in social formation, STRESS_CONFLICT_WEIGHT=0.06; divorce already reads edge conflict)
- GEN-072 Parenthood effects: children need care (needRest/social), parent stress/wellbeing coupling
- GEN-074 Family links depth: sibling detection via shared parents; household moves for children on divorce/marriage
- GEN-060 Kinship graph view + kinship-aware interactions (avoid marriage between close kin — currently only friendship-based candidates)
- KI-3/KI-6 death & decay semantics — DONE (batch 6); friendship cap (KI-8) — DONE (2026-09-09 session)
- Empty-household GC after moves (RT1-14) — DONE (watchdog takeover: family monthly phase 5, metric family.households_gc)

## Wave 3.3 — Deep kinship ✅ (batch 11)
- Kinship v2: blood second degree (uncle/niece, cousins) + affinal first degree (in-laws, step-parents via partner & spouseAtDeath edges); marriage ban auto-tightened; depth-boundary simplifications documented (RT2-07 closed)

## Education ↔ Economy ✅ (batch 11)
- economySystems(deps) wageSkillMultiplier injection; profile wires skillOf → 0.5 + 1.5×skill multiplier at hire time (skill priced once, recorded simplification)

## Housing ✅ (batch 12, 2026-09-09)
- packages/housing: side-table units (housing.units), rent/burden indicator (no money flow — documented), monthly system (assign/GC-orphans/metrics), housingCostMultiplier knob wired through profile + psychEnvBridge (burden folds 40% into financialStrain)
- EXP-004 landed: high-rent arm stress 0.530 vs control 0.493 (CI95 disjoint) — direction confirmed

## Wave 5 — Simulation Lab (P2, parallel-safe)
- GEN-150 Experiment config format (JSON) + CLI `npm run exp`
- GEN-151 Multi-seed runner (seed sets, parallel runs, CSV export)
- GEN-153 Aggregation: mean/CI per cohort; EXP-001..005 from guide §23 Wave 5
- First internal experiments using the full stack (unemployment→stress already validated directionally)

## Platform (P3–P4)
- GEN-110 API + GEN-112 Dashboard reading real run state (manifest JSON already exists)
- GEN-135 Observability: run compare tool (diff two manifests by digest)

## Quality / later (P3–P5)
- GEN-133 Property tests (money, rng, scheduler, graph) — hand-rolled generators (no new deps)
- HT-32 morning audit tasks (5 reviewers) — RED_TEAM_1.md round 1 done; round 2 after Wave 3.2
- Fuzz/scenario pack: extreme unemployment, very old population, tiny/huge populations
- Cross-platform determinism audit (IDLE-029)
