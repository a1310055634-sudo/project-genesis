# Project Genesis

A large-scale AI virtual society simulation platform: deterministic agent-based simulation of thousands of residents with psychology, relationships, families, and an economy.

This is **The Sims × RimWorld × Civilization × Agent-Based Computational Social Science** — as a computational model, not a clinical or predictive tool.

## Install

```bash
npm install
```

## Run tests

```bash
npm test          # all unit/integration tests
npm run typecheck # strict TypeScript check
```

## Run a simulation

```bash
npm run sim -- --seed 42 --population 10000 --years 10
```

Outputs a run manifest (seed, config hash, metrics) to `out/`.

## Documentation

- `ARCHITECTURE.md` — package boundaries, canonical contracts, simulation lifecycle
- `ROADMAP.md` — Now / Next / Later
- `PROJECT_GENESIS_GUIDE.md` — the full operating manual (V2.2)
- `docs/agent/` — agent status: BACKLOG, ACTIVE, BLOCKED, THROUGHPUT, NIGHTLY_REPORT

## Known limitations (v0.1)

- Simplified calendar (30-day months, no weekdays/leap years)
- Synthetic mortality/fertility curves (not calibrated to real demographics)
- Psychology modules are theory-inspired computational models, not clinical instruments
