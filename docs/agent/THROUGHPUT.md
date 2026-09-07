# Throughput

## Current
- Current wave: Wave 3.2 + Wave 5 + Platform landed (batches 6-9); Wave 3.3 / EXP expansion queued
- Concurrency tier: Tier 1–2 (5 subagent dispatches total, all clean)
- Active work packages: 0 (batch boundary — next dispatch picks from BACKLOG)
- Build status: GREEN (typecheck clean, 195/195 tests, 46 files)
- Last benchmark: benchmarks/RESULTS.md; last experiments: out/experiments/EXP-002.md, EXP-006.md

## Last batch (10 — watchdog takeover, 05:00)
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
