# Known Issues

## KI-1 · Relationship edge growth is unbounded (P2, performance/model)
Weekly social updates create edges between random strangers; edges are never pruned. After a 10k×10y run the graph holds ~2.18M edges (~248/person), dominating runtime (10k×10y = 14.9 min vs 1.9s demography-only) and memory.
Fix direction (backlog, HT-12 tie decay): interaction partners should be sampled from local context (household/coworker/neighborhood/friends-of-friends) rather than the global population, plus an edge-pruning policy when familiarity decays below a floor. Profile before optimizing (HT-24.6).

## KI-2 · Daily systems do a full-population scan (P3, documented v1 batch path)
Psychology/economy daily systems iterate all alive persons per day. Acceptable at current scales (10k×10y = 15 min); if 10k×100y (P3) is attempted, move to event-driven person-level scheduling (next-fire per person) or district batching. Measure first.

## KI-3 · Death leaves social edges frozen (P3, modeling)
Dead persons keep relationship edges/ids pointing at them (endpoints still resolve, invariants pass). Decide semantics: freeze (current) vs relationship.ended event + cleanup. Needed before Wave 3 marriage/family work.

## KI-4 · Income/wealth distribution is synthetic (P4)
Wages are uniform $2,200–$8,000/month; no education/skill premium yet. Fine for engine validation; calibrate when education lands (HT-12).

## KI-5 · One lockfile note for parallel agents (process, resolved)
Concurrent `npm install` from multiple agents risks package-lock contention; Director pre-links workspaces before dispatch. Keep this pattern for future parallel batches.
