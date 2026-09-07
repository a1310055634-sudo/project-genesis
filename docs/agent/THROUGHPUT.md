# Throughput

## Current
- Current wave: Wave 3 (family depth) — batch 4+5 merged; Wave 3.2 + Wave 5 queued
- Concurrency tier: Tier 1–2 (parallel subagents: 4 dispatched total, all clean)
- Active work packages: 0 (batch boundary — ready for next dispatch)
- Background investigations: 0
- Waiting reviews: 0
- Blocked: 0
- Integration queue: 0
- Build status: GREEN (typecheck clean, 137/137 tests)
- Last benchmark: KI-1 fix batch — 10k×10y 5.4 min (2.8× faster), see benchmarks/RESULTS.md

## Last batch (5)
- Tasks dispatched: family subagent + red-team audit + social KI-1 continuation (3 parallel) + Director fixes (RT1-02/03/04/05) + RT1-01 parenthood (Director)
- Tasks completed: 6
- Tasks failed: 0
- Reviews completed: red team round 1 (5 findings, all fixed same batch)
- Bugs found: 5 (red team) + 3 test-fixture misalignments during integration
- Bugs fixed: 8
- Tests added: 137 total (was 116)
- Experiments completed: 1 (children/spouse inheritance distribution)
- Merge conflicts: 0
- Rework tasks: 0

## Saturation decision
- Hold at Tier 1–2. Wave 3.2 kinship work touches marriage eligibility (family+social boundary) — contracts first.
- Watchdog automation is armed (hourly); continuation tasks are in docs/agent/BACKLOG.md under Wave 3.2 / Wave 5.
