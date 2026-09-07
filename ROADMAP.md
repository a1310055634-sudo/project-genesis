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

## Wave 3.2 / Wave 5 / Platform ✅ (batch 6-7, 2026-09-08)
- [x] Kinship-aware marriage (no parent/child/sibling/grandparent unions)
- [x] Divorce child custody (children follow custodial parent)
- [x] KI-3 death cleanup + KI-6 friendship drift (residual → KI-8 attention budget)
- [x] Parenthood psychology: caregiverLoad (stress bump + rest drain for parents of under-6s)
- [x] Experiment framework: multi-seed × multi-arm runner, byte-reproducible CSV, CI95, `npm run exp`
- [x] EXP-002 unemployment → stress: treatment 0.561 vs control 0.457 (model-internal, CI95 disjoint)
- [x] API + Dashboard (`npm run api`): start/pause/resume/step/speed/export over HTTP, person inspector, real-state charts

## Later
- Education, housing, labor market depth, institutions (HT-12 domains)
- Experiments EXP-001/003/004/005 (need scenario knobs: wealth tax, support injection)
- Wave 6 Red Team hardening rounds (round 1 done; round 2+ after each major wave)
- 10k × 100y attempt (P3) after KI-2 (event-driven person scheduling) + KI-8 (attention budget)

Full task pool: `docs/agent/BACKLOG.md`.
