# Known Issues

## KI-1 · Relationship edge growth — FIXED (KI-1 fix batch, 2026-09-08)
Local interaction sampling (household/coworker/friends-of-friends, 10% global fallback) + weekly pruning of low-familiarity acquaintance edges. 10k×10y: 14.9 min → 5.4 min (2.8×), edges 248/person → ~14.6/person. Follow-up: friendship edges still accumulate monotonically over decades (see KI-6).

## KI-2 · Daily systems do a full-population scan (P3, documented v1 batch path)
Psychology/economy daily systems iterate all alive persons per day. Acceptable at current scales (10k×10y = 5.4 min post-KI-1); if 10k×100y (P3) is attempted, move to event-driven person-level scheduling (next-fire per person) or district batching. Measure first.

## KI-3 · Death leaves social edges frozen — FIXED (batch 6)
Weekly "death sweep" phase now removes edges of dead persons, cleans the survivor's relationshipIds, and emits `relationship.ended {reason: 'death'}`. Semantics: death ends relationships.

## KI-6 · Friendship edges accumulate monotonically — PARTIALLY FIXED (batch 6)
Friendship edges now end by drift (familiarity < 0.15 after ~6 months of no contact → edge removed, relationshipIds cleaned, `relationship.ended {reason: 'drift'}`). Active friendships are protected by design (interactions refresh familiarity). Residual: per-person edge count plateaus around ~13 rather than declining further, because FoF local sampling keeps converting repeat contacts into new active friendships. True reduction needs an attention-budget / interaction-cap mechanism (new decision) → tracked as KI-8.

## KI-8 · Human attention budget not modeled — FIXED (2026-09-09 watch-dog session)
Edge-growth floor (~13 edges/person) is set by unbounded interaction willingness. Real networks cap active ties (Dunbar-like limits). Options: per-person weekly interaction budget, friendship cap with replacement, or drift floor that rises with person's edge count. DECIDED + IMPLEMENTED: friendship cap — friendCap = round(20 + 20 × extraversion), gating only NEW friendship formation (both parties need a free slot); maintenance interactions unaffected. Re-run EXP-006 as the regression probe: the extraversion→network-size pathway should now be capped per person.

## KI-4 · Income/wealth distribution is synthetic (P4)
Wages are uniform $2,200–$8,000/month; no education/skill premium yet. Fine for engine validation; calibrate when education lands (HT-12).

## KI-5 · One lockfile note for parallel agents (process, resolved)
Concurrent `npm install` from multiple agents risks package-lock contention; Director pre-links workspaces before dispatch. Keep this pattern for future parallel batches.

## KI-6 · Friendship edges accumulate monotonically — see FIXED note above (batch 6)

## KI-7 · Marriage candidate pool skews in small worlds (P4, fixed-ish)
The population generator's greedy pairing leaves skewed single-sex pools for some seeds; marriage candidates come from friendships only. Acceptable after social integration diluted it; revisit if marriage rates look pathological in experiments.

## RESOLVED 2026-09-08 (red team round 1)
- RT1-01 births required no marriage + no parenthood chain → FIXED: births now require a married couple (mutual partnerId); Person.motherId/fatherId added; minors get household parents; estates distribute spouse 50% + children rest (see family/inheritance). Household-size-2 birth constraint removed (couples with children can breed again).
- RT1-02 death did not clear spouse status → FIXED: widowhood handled at death time in demographics; family monthly sweep kept as safety net.
- RT1-03 systems scheduled at the final tick never fired → FIXED: stepTo fires entries ≤ target tick.
- RT1-04 EventLog O(n) splice per append → FIXED: ring buffer.
- RT1-05 createHousehold O(N²) in generation → FIXED: shared person index.

## KI-9 · psychEnvBridge rebuilds the kinship index every simulated day (P3, perf, red team RT3-10)
The caregiverLoad computation only needs per-person young-child counts, but rebuilds the full O(ever-born) kinship index daily (~3,600 rebuilds per 10k×10y run). Fix direction: incremental per-person young-child counter maintained on person.born/person.died events (same pattern as the education side-table). Tracked as a benchmark regression observation.

## Red team round 3 (2026-09-09, verdict PASS WITH ISSUES) — disposition
- RT3-01 widow-side affinal kinship — FIXED (deadSpouseOf reverse map + unified spouseEdgeIds/hasSpouseEdge + regression test)
- RT3-02 EXP-SANITY populationTarget silently ignored — FIXED (runner allows arm populationTarget override; seed/years stay reserved)
- RT3-03 sampler reads cumulative stats means — FIXED (monthly differencing via stats sum/count deltas, in experiment sampler AND API history)
- RT3-04 API person index blind to newborns — FIXED (monotonic size staleness check)
- RT3-05 hire-cohort wage pricing artifact — DOCUMENTED (DECISIONS.md: generation-time hires priced at base wage by design until education bootstrap exists)
- RT3-06 unemployedSince dead entries never cleaned — FIXED (search loop garbage-collects dead residents)
- RT3-07 no semantic marriage invariant — FIXED (married-not-close-kin invariant via kinship index)
- RT3-08 composed RT2-01 test couldn't catch its regression — FIXED (spouse-inheritance event counter + assertions)
- RT3-09 tautological GC assertion + EXP-001 text mismatch — FIXED both
- RT3-10 kinship daily rebuild — tracked as KI-9
- Carryovers RT1-10/11/12 remain LOW/backlog.
