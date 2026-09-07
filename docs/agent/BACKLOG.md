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
- GEN-053b Extraversion → interaction-frequency pathway (EXP-006 found the model gap: extraversion modulates liking/conflict but not interaction attempts or friend-making rate; add per-person interaction attempt probability ~ extraversion, then re-run EXP-006 as regression probe)
- GEN-058 Relationship conflict → divorce coupling depth (conflict from interactions, not just edges)
- GEN-072 Parenthood effects: children need care (needRest/social), parent stress/wellbeing coupling
- GEN-074 Family links depth: sibling detection via shared parents; household moves for children on divorce/marriage
- GEN-060 Kinship graph view + kinship-aware interactions (avoid marriage between close kin — currently only friendship-based candidates)
- KI-3/KI-6: death & decay semantics for friendship edges (relationship.ended on death, friendship decay floor)
- Empty-household GC after moves (RT1-14)

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
