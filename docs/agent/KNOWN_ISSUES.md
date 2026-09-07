# Known Issues

## KI-1 · Relationship edge growth — FIXED (KI-1 fix batch, 2026-09-08)
Local interaction sampling (household/coworker/friends-of-friends, 10% global fallback) + weekly pruning of low-familiarity acquaintance edges. 10k×10y: 14.9 min → 5.4 min (2.8×), edges 248/person → ~14.6/person. Follow-up: friendship edges still accumulate monotonically over decades (see KI-6).

## KI-2 · Daily systems do a full-population scan (P3, documented v1 batch path)
Psychology/economy daily systems iterate all alive persons per day. Acceptable at current scales (10k×10y = 5.4 min post-KI-1); if 10k×100y (P3) is attempted, move to event-driven person-level scheduling (next-fire per person) or district batching. Measure first.

## KI-3 · Death leaves social edges frozen (P3, modeling)
Dead persons keep relationship edges/ids pointing at them (endpoints still resolve, invariants pass — marital status IS cleaned at death time since RT1-02). Decide semantics: freeze (current) vs relationship.ended + edge cleanup on death. Needed before deeper Wave 3 social dynamics.

## KI-4 · Income/wealth distribution is synthetic (P4)
Wages are uniform $2,200–$8,000/month; no education/skill premium yet. Fine for engine validation; calibrate when education lands (HT-12).

## KI-5 · One lockfile note for parallel agents (process, resolved)
Concurrent `npm install` from multiple agents risks package-lock contention; Director pre-links workspaces before dispatch. Keep this pattern for future parallel batches.

## KI-6 · Friendship edges accumulate monotonically (P3, modeling)
Pruning never removes edges whose endpoints list each other in relationshipIds (friendship), so per-person friendship counts grow roughly linearly with decades. Long runs (50y+) will need a relationship.ended/decay path for friendships too — pair with KI-3 semantics work.

## KI-7 · Marriage candidate pool skews in small worlds (P4, fixed-ish)
The population generator's greedy pairing leaves skewed single-sex pools for some seeds; marriage candidates come from friendships only. Acceptable after social integration diluted it; revisit if marriage rates look pathological in experiments.

## RESOLVED 2026-09-08 (red team round 1)
- RT1-01 births required no marriage + no parenthood chain → FIXED: births now require a married couple (mutual partnerId); Person.motherId/fatherId added; minors get household parents; estates distribute spouse 50% + children rest (see family/inheritance). Household-size-2 birth constraint removed (couples with children can breed again).
- RT1-02 death did not clear spouse status → FIXED: widowhood handled at death time in demographics; family monthly sweep kept as safety net.
- RT1-03 systems scheduled at the final tick never fired → FIXED: stepTo fires entries ≤ target tick.
- RT1-04 EventLog O(n) splice per append → FIXED: ring buffer.
- RT1-05 createHousehold O(N²) in generation → FIXED: shared person index.
