# Benchmark Results

Full society stack (demography + social + economy + psychology), seed 42.
Machine: Windows 11, Node v24.19.0. Guide §26 metrics.

## 2026-09-08 — Wave 1/2 baseline (first full-stack run)

| population | years | runtime | peak RSS | alive | events | events/sec | digest |
|---|---|---|---|---|---|---|---|
| 1,000 | 1 | 1,718 ms | 317.1 MB | 980 | 139,020 | 80,920 | 718b8e35 |
| 10,000 | 1 | 20,973 ms | 548 MB | 9,839 | 1,425,701 | 67,978 | 8fa96444 |

CLI end-to-end (manifest + digest included):

| population | years | runtime | notes |
|---|---|---|---|
| 10,000 | 10 | 894,467 ms (~14.9 min) | 8,511 alive; 14.59M events; 2.18M relationship edges; digest 6d618eb0 |

Reference point (demography-only, before Wave 2 systems): 10k × 10y = 1.9s.
The social graph dominates cost (weekly interaction + unbounded edge growth — see KNOWN_ISSUES #1).

## Scaling notes
- 1k→10k (10× pop, same 1y): runtime 12.2× — near-linear with a slight superlinear factor from the social graph.
- Guide §26 targets: P1 (10k×1y) achieved at ~21s. P2 (10k×10y) baseline achieved at ~15 min. P3 (10k×100y) not attempted (est. ~2.5h at current scaling; edge growth makes extrapolation unreliable — profile first, HT-24.6).

## 2026-09-08 — KI-1 fix batch (social local sampling + acquaintance pruning)

Fix for KNOWN_ISSUES #1: interaction partners are now sampled locally
(household p=0.5 → coworker p=0.3 → friend-of-friend → 10% global fallback) and
acquaintance edges with familiarity < 0.05 are pruned weekly (mutual friendship
edges are never pruned). Same harness (`npm run bench`), seed 42; the 10k×10y
row comes from `npm run bench -- 10000 10`.

| population | years | runtime | peak RSS | alive | events | events/sec | digest |
|---|---|---|---|---|---|---|---|
| 1,000 | 1 | 1,675 ms | 314.2 MB | 980 | 139,128 | 83,061 | 0c0da210 |
| 10,000 | 1 | 18,618 ms | 436.9 MB | 9,839 | 1,426,691 | 76,630 | af3155bf |
| 10,000 | 10 | 322,136 ms | 525.3 MB | 8,511 | 14,602,249 | 45,329 | 369adea4 |

Comparison against the Wave 1/2 baseline above:

| scenario | baseline runtime | KI-1 runtime | delta | baseline edges | KI-1 edges |
|---|---|---|---|---|---|
| 1k × 1y | 1,718 ms | 1,675 ms | −2.5% | — | — |
| 10k × 1y | 20,973 ms | 18,618 ms | −11.3% | — | — |
| 10k × 10y | 894,467 ms (~14.9 min, CLI e2e) | 322,136 ms (~5.4 min, harness) | −64% (2.8×) | 2,180,000 (~248/alive) | 124,517 (14.63/alive, −94%) |

KI-1 counters at 10k×10y: 1,053,240 edges pruned cumulatively
(`social.edges_pruned`), 19,593 friendships formed (`relationship.started`).
Digests differ from the baseline batch by design (social dynamics changed);
run-to-run replay determinism is covered by the packages/social determinism
tests (green).

Note: the 10k×10y baseline row above was measured CLI end-to-end while the new
row is the bench harness — not perfectly like-for-like, but the 2.8× gap is
dominated by the social graph fix, not harness overhead.
