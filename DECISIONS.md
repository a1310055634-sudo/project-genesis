# Decisions

Only significant architecture decisions are recorded here (one line each, newest last).

- 2026-09-08 — npm workspaces instead of pnpm: pnpm is not installed on this machine; guide §3 allows adapting to the existing environment.
- 2026-09-08 — CommonJS TS modules + `tsx` runtime + root `paths`/vitest aliases: avoids ESM extension pitfalls for agent-generated code; packages import each other by root name `@genesis/<pkg>` only (never deep paths).
- 2026-09-08 — Person schema (identity + Personality/PsychologyState/EconomyState/SocialState blocks) is canonical in `@genesis/simulation`; domain packages own update logic, not the schema (prevents duplicate Person types).
- 2026-09-08 — Money as integer cents with explicit rounding helpers in `@genesis/shared` (guide §4.5 day-one constraint).
- 2026-09-08 — Simplified calendar: 24h days, 30-day months, 12-month years (TICKS_PER_YEAR=8640); documented simplification, revisit if demographics need realism.
- 2026-09-08 — Event-log keeps per-type aggregate counters + bounded recent window instead of unbounded raw history (guide §4.5 constraint 5).
- 2026-09-08 — Death-time spouse snapshot (Person.spouseAtDeathId, red team RT2-01): demographics snapshots the partner at the moment of death and clears partnerId both sides immediately; family inheritance reads the snapshot. Chosen over "keep deceased's partnerId" so the partner-mutual invariant stays strict and system ordering never affects inheritance semantics.
- 2026-09-08 — Education lives in a ctx.extensions side-table (education.records), not the Person schema: experimental domain first; promote to schema when economy needs skill→wage coupling. Education state is intentionally outside the replay digest; determinism asserted by package tests.
- 2026-09-08 — Experiment arms may not override seed/years (red team RT2-03): those are experiment-level contracts; runner re-applies authoritative keys after arm overrides.
- 2026-09-09 — Skill→wage pricing applies ONLY to post-generation hires (red team RT3-05): generation-time employees keep the base employer wage because the education side-table has no bootstrap history for founders. Recorded artifact: wage variance partially correlates with having experienced unemployment. Revisit when education bootstrap lands.
- 2026-09-08/09 — Psychology clamps are NaN-TO-ZERO by design (red team RT1-11 disposition): a NaN reaching a psychology clamp indicates an upstream bug; the clamp keeps the domain bounded (guide §29) while the invariant suite + bounds tests catch persistent NaN sources upstream. Fail-fast was rejected: one noisy input should not abort a 10k×10y run.
- 2026-09-09 — populationTarget IS arm-overridable (red team RT3-02): EXP-SANITY's scale sweep requires it; seed/years remain reserved.
