# Roadmap

## Now (Wave 1 — World Foundation)
- [x] Monorepo bootstrap (npm workspaces, TypeScript strict, Vitest)
- [x] Canonical contracts: tick model, RNG, IDs, events, scheduler, metrics
- [ ] Simulation engine + world state + invariants
- [ ] Population generator (10,000 residents, households, employers)
- [ ] Deterministic replay test (seed 42 → identical results)
- [ ] Simulation CLI (`npm run sim`)
- [ ] Benchmark 1k×1y and 10k×1y

## Next (Wave 2 — Psychology / Economy / Social)
- [ ] Psychology: Big Five, affect, stress, needs, coping, wellbeing (validation scenarios)
- [ ] Economy: employers, jobs, salary, consumption, wealth (integer cents)
- [ ] Social: relationship graph, interactions, friendship formation
- [ ] Integration: daily psychology/social/economy systems wired into the engine

## Later (Wave 3+)
- Marriage/partnership, birth into households, multi-generation families
- Education, housing, labor market depth, institutions
- Experiment framework (multi-seed, parameter sweep, reports)
- Dashboard (API + UI reading real simulation state)
- Red team hardening passes

Full task pool: `docs/agent/BACKLOG.md`.
