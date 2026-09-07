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
