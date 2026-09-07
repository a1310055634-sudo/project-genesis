# Project Genesis Agent Rules

Project Genesis is a large AI virtual-society simulation platform.

## Operating mode
- The authoritative operating manual is `PROJECT_GENESIS_GUIDE.md` in this repo (V2.2).
- Operational authority: HT-2 (concurrency ladder), HT-5 / HT-28 (batch loop), HT-30 (goal), HT-31 (master prompt), HT-22 (task ratio). Superseded V1 sections of the guide (§15.2, §35, §37, §38, Appendix B) must NOT be used.
- Maintain `docs/agent/`: BACKLOG.md, ACTIVE.md, BLOCKED.md, THROUGHPUT.md, MERGE_QUEUE.md, IDLE_QUEUE.md, NIGHTLY_REPORT.md. Update THROUGHPUT.md at every batch boundary.

## Day-one hard constraints (guide §4.5 — violation is P0)
- Money uses integer minor units (cents). No floating point for money.
- No wall-clock time in core simulation (`Date.now()` / `new Date()` only in CLI / observability / benchmark layers).
- Deterministic iteration: sort Map/Set/object keys explicitly; stable serialization order.
- Event-driven scheduling: no full-population scan per tick as the regular update path.
- Event log tiered persistence: aggregate cold data; never unbounded raw growth.

## Model
Use GLM-5.3-Flash for the primary agent and all configurable subagents. Do not switch to another paid model without explicit user authorization.

## Core behavior
- Continue through the backlog while the active goal is incomplete and safe unblocked work remains.
- Never generate useless code or text just to consume tokens.
- Search the repository before creating a new abstraction.
- Extend canonical implementations instead of creating parallel versions.
- Keep simulation core independent from UI.
- All randomness must use the seeded RNG from `@genesis/core`.
- Prefer deterministic and reproducible simulation behavior.
- Do not use real personal data as resident data.
- Treat psychology models as simplified computational models, not clinical diagnostics.

## Workflow
For every medium/large task:
1. Explore existing code.
2. Plan the smallest coherent change.
3. Implement.
4. Test.
5. Self-review.
6. Peer-review when appropriate.
7. Fix blockers.
8. Integrate.
9. Update relevant docs/status.

## Quality gate
A feature is not done until:
- typecheck passes
- relevant tests pass
- integration behavior is verified where needed
- no obvious duplicate implementation exists
- error cases are handled
- deterministic behavior is tested when randomness is involved

If tests fail, restore green before stacking more related features.

## Architecture
Prefer:
- modular packages (`@genesis/shared` → `@genesis/core` → `@genesis/simulation` → domain packages → apps)
- explicit interfaces
- dependency direction (nothing below `core` imports from packages above it)
- event-driven cross-domain communication
- injectable RNG
- simulation CLI
- observable run metadata

Avoid:
- god objects
- hidden global state
- Math.random() in simulation logic
- duplicated managers/services
- domain logic inside UI components
- uncontrolled O(N²) loops

## Parallelism
Parallelize only tasks with stable interfaces and mostly non-overlapping files. Do not let multiple agents rewrite the same core schema simultaneously.

## Status
Maintain:
- ARCHITECTURE.md
- ROADMAP.md
- docs/agent/BACKLOG.md
- docs/agent/ACTIVE.md
- docs/agent/BLOCKED.md
- docs/agent/THROUGHPUT.md
- docs/agent/NIGHTLY_REPORT.md

## Priority
P0 broken build/tests
P1 foundations
P2 end-to-end capabilities
P3 domain depth
P4 UI polish
P5 optional narrative features
