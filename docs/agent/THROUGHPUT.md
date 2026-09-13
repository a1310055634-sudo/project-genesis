# Throughput

## Current
- Current wave: Wave 3.2 + Wave 5 + Platform landed (batches 6-9); Wave 3.3 / EXP expansion queued
- Concurrency tier: Tier 1–2 (5 subagent dispatches total, all clean)
- Active work packages: 0 (batch boundary — next dispatch picks from BACKLOG)
- Build status: GREEN (typecheck clean, 195/195 tests, 46 files)
- Last benchmark: benchmarks/RESULTS.md; last experiments: out/experiments/EXP-002.md, EXP-006.md

## Last batch (13 — watchdog takeover, 07:01)
- Task: housing domain starter (packages/housing, education side-table pattern) + EXP-004 experiment
- Status: GREEN — 229/229 tests (53 files); EXP-004 direction confirmed (high-rent stress 0.530 vs control 0.493, CI95 disjoint)
- Notes: fullstack tests now carry explicit 120s timeouts (housing made the 300×3y run cross the 5s default under parallel load)

## Batch 12 (watchdog takeover, 02:00)
- EXP-003 landed: communitySupportBias knob + experiment (supported 0.443 vs control 0.488 — buffering direction confirmed, CI95 disjoint)
- P0 determinism fix: endpoint invariant gauge was path-dependent (stepped vs one-shot digests diverged); final check now unified in run/runYears
- EXP-001 window honestly re-scoped: minimal-factory signal ~+0.002 at months 4-5 (sub-noise at n=5), full stack +0.011 — bounded non-inverse assertion replaces over-claimed direction
- Tests: 222 (51 files), GREEN

## Batch 11 (evening session)
- Dispatched: 3 parallel agents — GEN-058 stress→conflict (social), skill→wage EconomyDeps (economy), kinship v2 deep kinship (simulation+family)
- Completed: 3 + Director integration (profile wires skillOf → wage multiplier 0.5 + 1.5×skill)
- Tests: 206 → 222 (51 files)
- Status: GREEN, committed

## Batch 10 (watchdog takeover, 05:00)
- Trigger: main session idle ≥45 min; build/test GREEN at takeover
- Task: RT1-14 empty-household GC (family monthly phase 5, metric family.households_gc)
- Tests: 195 → 198 (3 new GC tests; deterministic constructions, no seed-tuned fixtures)
- Status: GREEN, committed

## Previous batch (9)
- Dispatched: red-team round 2 (read-only) + GEN-053b (social) + education package (new agent) — 3 parallel
- Completed: 3 + Director fixes (RT2-01..06, 09; RT1-07/09/13 carryovers)
- Red team round 2 verdict: FAIL → all BLOCKER/HIGH/MEDIUM fixed same batch (spouse-snapshot inheritance, API history namespace, experiments guards, body-limit, birth-pair enumeration, manifest final flag)
- Tests: 161 → 195
- EXP-006: negative result → model gap (GEN-053b) → fix → direction confirmed +30% edges (CI95 disjoint) — full science loop closed

## Saturation decision
- Hold at Tier 1–2. Next dispatch pool (BACKLOG): Wave 3.3 deep kinship + affinal edges, EXP-001/003/004/005 (needs scenario injection knobs), education↔economy skill→wage coupling, empty-household GC (RT1-14), attention budget decision (KI-8).
- Watchdog automation armed (hourly): continuation = BACKLOG top items, per AGENTS.md + PROJECT_GENESIS_GUIDE.md V2.2 (HT layer authoritative).

## 2026-09-14 01:07 (watchdog takeover)
- Task: BACKLOG #4 — RT5-08/09 LOW residue sweep (final batch)
- Fixed: institutions assignment.test tautology (`|| true`) + void silencers removed behavior-identically; media.test dead RelationshipGraph block dropped; media belief test `void believers` → real `believers > 0`; media.ts stale v1 header rewritten to v2/v3 reality
- Test infra: api.test.ts afterAll drains in-flight /api/sim/stop before server.close() — recurring unhandled ECONNRESET ("Errors: 1 error") gone
- Tests: 252/252 green ×2 consecutive runs, typecheck 0 errors
