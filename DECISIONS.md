# Decisions

Only significant architecture decisions are recorded here (one line each, newest last).

- 2026-09-08 — npm workspaces instead of pnpm: pnpm is not installed on this machine; guide §3 allows adapting to the existing environment.
- 2026-09-08 — CommonJS TS modules + `tsx` runtime + root `paths`/vitest aliases: avoids ESM extension pitfalls for agent-generated code; packages import each other by root name `@genesis/<pkg>` only (never deep paths).
- 2026-09-08 — Person schema (identity + Personality/PsychologyState/EconomyState/SocialState blocks) is canonical in `@genesis/simulation`; domain packages own update logic, not the schema (prevents duplicate Person types).
- 2026-09-08 — Money as integer cents with explicit rounding helpers in `@genesis/shared` (guide §4.5 day-one constraint).
- 2026-09-08 — Simplified calendar: 24h days, 30-day months, 12-month years (TICKS_PER_YEAR=8640); documented simplification, revisit if demographics need realism.
- 2026-09-08 — Event-log keeps per-type aggregate counters + bounded recent window instead of unbounded raw history (guide §4.5 constraint 5).
