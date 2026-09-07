# Roadmap

## Now (Wave 1 — World Foundation) ✅ DONE 2026-09-08
- [x] Monorepo bootstrap (npm workspaces, TypeScript strict, Vitest)
- [x] Canonical contracts: tick model, RNG, IDs, events, scheduler, metrics
- [x] Simulation engine + world state + invariants (guide §27)
- [x] Population generator (10,000 residents, households, employers)
- [x] Deterministic replay test (seed 42 → identical digest)
- [x] Simulation CLI (`npm run sim`)
- [x] Benchmark 1k×1y and 10k×1y (benchmarks/RESULTS.md)

## Wave 2 — Psychology / Economy / Social ✅ DONE 2026-09-08
- [x] Psychology: Big Five, affect, stress, needs, wellbeing + validation scenarios
- [x] Economy: employers, jobs, salary, consumption, wealth (integer cents, conservation)
- [x] Social: relationship graph, interactions, friendship formation, tie decay
- [x] Integration: full-stack profile wired into CLI; unemployment→stress direction validated

## Next (Wave 3 — Relationships & Family)
- [ ] Marriage/partnership state machine (edge ↔ person status consistency)
- [ ] Household formation on marriage; divorce/split
- [ ] Births into households (parents recorded), parent-child links
- [ ] Inheritance hooks on death
- [ ] KI-1 fix: local interaction sampling + edge pruning (tie decay), then re-benchmark

## Later
- Education, housing, labor market depth, institutions (HT-12 domains)
- Experiment framework (multi-seed runner, parameter sweep, CSV/report) — first 5 experiments of guide §23 Wave 5
- Dashboard (API + UI reading real run state)
- Wave 6 Red Team hardening rounds (3× RED→TRIAGE→FIX→REGRESSION→BENCHMARK)
- 10k × 100y attempt (P3) after KI-1/KI-2 fixes

Full task pool: `docs/agent/BACKLOG.md`.
