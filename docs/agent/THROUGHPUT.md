# Throughput

## Current
- Current wave: Wave 3.2 + Wave 5 + Platform landed (batches 6-9); Wave 3.3 / EXP expansion queued
- Concurrency tier: Tier 1–2 (5 subagent dispatches total, all clean)
- Active work packages: 0 (batch boundary — next dispatch picks from BACKLOG)
- Build status: GREEN (typecheck clean, 195/195 tests, 46 files)
- Last benchmark: benchmarks/RESULTS.md; last experiments: out/experiments/EXP-002.md, EXP-006.md

## Last batch (13 — watchdog takeover, 07:01)
- Task: housing domain starter (packages/housing, education side-table pattern) + EXP-004 experiment
- Status: GREEN — 229/229 tests (53 files); EXP-004 direction confirmed (high-rent stress 0.530 vs control 0.493, CI95 disjoint)
- Notes: fullstack tests now carry explicit 120s timeouts (housing made the 300×3y run cross the 5s default under parallel load)

## Batch 12 (watchdog takeover, 02:00)
- EXP-003 landed: communitySupportBias knob + experiment (supported 0.443 vs control 0.488 — buffering direction confirmed, CI95 disjoint)
- P0 determinism fix: endpoint invariant gauge was path-dependent (stepped vs one-shot digests diverged); final check now unified in run/runYears
- EXP-001 window honestly re-scoped: minimal-factory signal ~+0.002 at months 4-5 (sub-noise at n=5), full stack +0.011 — bounded non-inverse assertion replaces over-claimed direction
- Tests: 222 (51 files), GREEN

## Batch 11 (evening session)
- Dispatched: 3 parallel agents — GEN-058 stress→conflict (social), skill→wage EconomyDeps (economy), kinship v2 deep kinship (simulation+family)
- Completed: 3 + Director integration (profile wires skillOf → wage multiplier 0.5 + 1.5×skill)
- Tests: 206 → 222 (51 files)
- Status: GREEN, committed

## Batch 10 (watchdog takeover, 05:00)
- Trigger: main session idle ≥45 min; build/test GREEN at takeover
- Task: RT1-14 empty-household GC (family monthly phase 5, metric family.households_gc)
- Tests: 195 → 198 (3 new GC tests; deterministic constructions, no seed-tuned fixtures)
- Status: GREEN, committed

## Previous batch (9)
- Dispatched: red-team round 2 (read-only) + GEN-053b (social) + education package (new agent) — 3 parallel
- Completed: 3 + Director fixes (RT2-01..06, 09; RT1-07/09/13 carryovers)
- Red team round 2 verdict: FAIL → all BLOCKER/HIGH/MEDIUM fixed same batch (spouse-snapshot inheritance, API history namespace, experiments guards, body-limit, birth-pair enumeration, manifest final flag)
- Tests: 161 → 195
- EXP-006: negative result → model gap (GEN-053b) → fix → direction confirmed +30% edges (CI95 disjoint) — full science loop closed

## Saturation decision
- Hold at Tier 1–2. Next dispatch pool (BACKLOG): Wave 3.3 deep kinship + affinal edges, EXP-001/003/004/005 (needs scenario injection knobs), education↔economy skill→wage coupling, empty-household GC (RT1-14), attention budget decision (KI-8).
- Watchdog automation armed (hourly): continuation = BACKLOG top items, per AGENTS.md + PROJECT_GENESIS_GUIDE.md V2.2 (HT layer authoritative).

## 2026-09-14 01:07 (watchdog takeover)
- Task: BACKLOG #4 — RT5-08/09 LOW residue sweep (final batch)
- Fixed: institutions assignment.test tautology (`|| true`) + void silencers removed behavior-identically; media.test dead RelationshipGraph block dropped; media belief test `void believers` → real `believers > 0`; media.ts stale v1 header rewritten to v2/v3 reality
- Test infra: api.test.ts afterAll drains in-flight /api/sim/stop before server.close() — recurring unhandled ECONNRESET ("Errors: 1 error") gone
- Tests: 252/252 green ×2 consecutive runs, typecheck 0 errors

## 2026-09-14 02:06 (watchdog takeover)
- Task: BACKLOG #2 (half) — media belief v3 social reinforcement
- Mechanism: mediaSystem deps {neighbors, reinforcement}; conversion = base 0.6 + 0.25 × believing-neighbor share (any-piece snapshot before sweep → no order effects); flat v2 behavior when deps absent
- Wired: profile injects graph.neighborsOf; BELIEF_SOCIAL_REINFORCEMENT=0.25; new counter media_reinforced_hearings
- Tests: conversionProbability unit (formula/clamp/sign mutation-kill), paired-world direction (reinforced > flat, ring graph), believed ⊆ heard invariant under reinforcement; 255/255 green, typecheck 0 errors
- Remaining (next window): source trust (rumor vs official) — needs rumor source model

## 2026-09-14 03:03 (watchdog takeover)
- Task: BACKLOG #5 — dashboard institutions/media side-table UI
- API: person dossier gains `institutions` block {schoolId, overflow, quality} (null for non-pupils) from ASSIGNMENTS/SCHOOLS side-tables
- UI: person inspector renders structured sections (identity/marital/economy/education/housing/school/media) with raw JSON collapsed; overview cards + KEY_METRICS rows for institutions_pupils_assigned/overflow and media_pieces/believers
- Tests: dossier institutions-key + dashboard marker assertions; 255/255 green, typecheck 0 errors

## 2026-09-14 04:01 (watchdog takeover)
- Task: BACKLOG #7 — doc hygiene (final watchdog-appropriate item)
- NIGHTLY_REPORT: batch addenda reordered 6→7→8→9 (was 7,8,9,6), out-of-order caveat removed; FINAL STATE refreshed (59 commits, 255/255, overnight watchdog session summarized)
- HANDOFF: §0 status + §6 backlog statuses synced (#2 half done w/ source-trust fork noted, #4/#5/#7 DONE, footer totals)
- Tests: 255/255 green, typecheck 0 errors (no code changes)

## 2026-09-14 05:02 (watchdog takeover)
- Task: perf guard — bench re-run after media v3 social reinforcement (feature pool empty; keep-alive verification batch)
- 10k×1y 14.7s vs 18.6s baseline: no regression, reinforcement lookup within noise; RESULTS.md appended
- Tests: 255/255 green, typecheck 0 errors (no code changes)

## 2026-09-14 06:07 (watchdog takeover)
- Task: overnight reference run refresh — 10k×10y on current code (media v3 reinforcement included)
- out/run-42-49a14ea4.json (digest d51e548f, seed 42, final config {10000, 10y}): 18,863,684 events, ~5.5 min wall
- End state: 9,920 alive-ish structure sane (households 5,597; unemployment 38.1%; stress 0.456; wellbeing 0.546; relationships 65,489)
- Belief dynamics at 10y: 382,686 hearings / 321,304 conversions / 197,519 lapses / last-piece believers 2,417 (~24% of alive) — plateau-not-collapse holds; reinforced hearings 98.9% post warm-up; institutions overflow 0
- Tests: 255/255 green, typecheck 0 errors (no code changes; out/ gitignored by design)

## 2026-09-14 07:04 (watchdog takeover)
- Task: scientific regression check — information-chain experiments re-run under media v3 reinforcement (now default in fullStackSystems)
- EXP-021 direction HOLDS: extraverted 20.11 vs control 17.5 early-window listeners (n=3 seeds, +15%; was +14% pre-reinforcement) — network→media-exposure pathway intact
- EXP-022 clean re-run (882 cumulative hearings, no loss); plateau covered by 06:00 10k×10y run (~24% believers) + package plateau regression test
- Old reports preserved as out/experiments/EXP-021|022.pre-reinforcement.md (out/ gitignored — backups local only)
- Tests: 255/255 green, typecheck 0 errors (no code changes)

## 2026-09-15 24:00 (main session — school funding loop)
- Mechanism: institutionsSystem(deps{getTaxPool,setTaxPool} injected by profile from @genesis/economy) — monthly bill = schoolFundingPerPupilCents(default $1,000) × assigned pupils, pool-first/deficit-audited (welfare/pension convention); funded ratio drives ±0.01/mo quality drift toward [0.35,0.85]; crowding above PUPILS_PER_SCHOOL erodes 0.02/mo·unit; capacity build headroom 1.15 absorbs RT6-D1-3
- Config: schoolFundingPerPupilCents knob (3-point sync: interface + strip list + validation)
- Tests: funding.test.ts (solvent/empty/pool-debit/deps-skip ×4) + 10k capacity headroom assertion; 263/263 green, typecheck 0 errors
- Note: default world is pension-deficit-heavy → schools start underfunded (quality erodes slowly) — policy space: raise incomeTaxRate or cut the bill; documented in config doc

## 2026-09-15 24:20 (main session — media source trust, v3 complete)
- Mechanism: MediaPiece.origin 'official'|'rumor'; per-cycle genesis (RUMOR_GENESIS_PROB_PER_CYCLE=0.25) — one alive believer of the newest piece gossips into a NEIGHBORHOOD rumor at RUMOR_TRUST=0.5 × base conversion; requires neighbors dep (bare runs unchanged); media_rumors_spawned counter; media.published covers rumor genesis (auditability)
- Tests: rumor spawn + believed⊆heard on rumors + trust-discount wiring + bare-run no-op (×3 net new); 266/266 green, typecheck 0 errors
- Media belief v3 COMPLETE (social reinforcement + source trust); recorded open followup: competing outlets, multi-hop rumor spread

## 2026-09-16 02:05 (roadmap A1 — social graph micro-optimization)
- graph.ts: adjacency now carries the edge object per direction (edge(a,b) = two hash lookups, zero allocation); edgeKey without array+sort; new forEachEdge (Map insertion order — seed-derived deterministic)
- formation.ts decay/sweep/prune passes + metrics.ts isolated stats + profile tieCounts switched to forEachEdge (per-edge-independent passes only); allEdges() kept for canonical serialization order
- Verified behavior-preserving via stash A/B: identical digests (1k 28dd585c, 10k e579a966) and event counts with/without the patch; 10k×1y 15.7s → 12.1s (−23%), events/sec +29%
- Tests: 266/266 green, typecheck 0 errors

## 2026-09-16 03:02 (roadmap A2 — rng fork amortization)
- psychology/system.ts: per-person-per-day fork replaced by ONE daily fork consumed in array order; replay stability rests on append-only persons + skip-before-draw invariants (documented in the class docblock)
- Bench: 10k×1y 12.1s → 7.12s (−41% this step; −52% vs the 14.7s pre-A1 baseline — ≤10s target already met), 1k×1y 1.0s → 0.56s, events/sec 164k → 279k, peak RSS 440 → 311 MB
- Digests changed by design (draw sequences re-based); same-code replay determinism green (266/266, incl. fullstack GEN-115 replay test)
- Other fork sites inventoried: all remaining forks are per-tick/per-fire (cheap); psychology was the only per-person fork

## 2026-09-16 04:01 (roadmap A3 — formal bench record)
- RESULTS.md updated: 10k×1y 7.69s (journey 18.6 → 12.1 → 7.7s, cumulative −59%, ≤10s target met); 100y projection ~21 min
- Tests: 266/266 green, typecheck 0 errors

## 2026-09-17 00:12 (roadmap A4 — birth-cohort analytics)
- New packages/simulation/src/cohort.ts: recordCohortMetrics groups alive residents by birth DECADE (founders carry negative decades — born before tick 0); per-cohort gauges alive/mean_wealth_cents/employment_rate + cohort.tracked; dead cohorts ZERO out (anti-freeze) via a seen-set in ctx.extensions
- Hook: demographics monthly pass stamps cohorts after births; O(N)/month
- Sampling cadence: controller history cap (2,000) already covers 100y monthly sampling (1,200 points) — no change needed (documented)
- Digest note: cohort.* gauges enter the metrics snapshot → run digests re-base (replay determinism green)
- Tests: cohort.test.ts ×3 (gauge shape/founders-negative-decade/anti-freeze consistency, decade helper arithmetic, digest determinism); 269/269 green, typecheck 0 errors

## 2026-09-17 01:24 (roadmap A5 — 10k×100y century run + report)
- out/run-42-c5357eaa.json (digest 8fa67f00): 618s runtime, 132M events, 1,200 months
- HEADLINE: demographic collapse 10,000 → 648 alive (births 2,440 vs deaths 11,792) — married-fertility × spouse-pool shrinkage spiral; CENTURY_REPORT.md has the full analysis
- Pension 100% deficit ($3.5B), schools never funded (ratio=0, predicted), wealth concentrated to $3.16M mean + $6.7B unclaimed estates; belief churn balanced at century scale (1.6M conversions vs 1.48M lapses)
- Semantic decisions recorded for user: fertility coupling, school funding direct-budget, employer-slots artifact
- Phase A COMPLETE → next fire starts Phase D (D1 run compare)

## 2026-09-17 03:04 (roadmap D1 — run compare, GEN-135)
- npm run compare -- <a.json> <b.json> [--out report.md]: identity (digest/configHash), population rows, full metrics diff (changed sorted by |Δ|, pct relative to |A|, null on 0→x rise), only-in sets, event-type deltas; pure core (compare.ts) + CLI wiring, formatter caps long sections
- Demo: 10y vs 100y manifests — alive −92.9%, estates_unclaimed 2.88B→674.59B cents, pension deficit ×10, cohort turnover −100% rows — collapse narrative surfaced in one command
- Tests: compare.test.ts ×4 (identity flags, delta/pct/zero-rise null, empty diff, formatter); 273/273 green, typecheck 0 errors

## 2026-09-17 04:05 (roadmap D2 — person life timeline)
- API: GET /api/persons/:id/timeline — milestones from canonical state (birth, school_enrolled@6 if assigned, came_of_age@18, child_born per real child birthTick, retired@65, death) sorted by tick; marriage has no stored tick → honest `undated` section (not fabricated into the sequence); recent log-window activity attached
- controller: index/staleness block extracted to resolvePerson (shared by person() + timeline()); dashboard person inspector renders a Life timeline section (undated entries appended)
- Tests: timeline endpoint (200/birth-first/sorted/undated array) in the dossier flow; 273/273 green, typecheck 0 errors

## 2026-09-17 05:04 (roadmap D3 — family tree)
- API: GET /api/persons/:id/kinship — root + disjoint sections (parents, grandparents via parents' links, partners incl. deceased spouse via spouseAtDeathId, siblings by shared parent, children); dead relatives included (lineage outlives members); O(N) scans per request
- Dashboard: Family tree section (comma lists with † for dead, relation + age badges) — grouped lists keep the dependency-free render trivial; svg layout is future work
- Tests: kinship endpoint (200/root id/5 sections/node payload shape) in the dossier flow; 273/273 green, typecheck 0 errors

## 2026-09-17 06:02 (roadmap D4 — belief network view; Phase D COMPLETE)
- controller retains the run's social graph (start() now keeps fullStackSystems' graph; was discarded)
- API: GET /api/persons/:id/beliefs — heard pieces (origin + believed/heard counts) + per-neighbor hearing/belief stats sampled from the social graph (capped 30, ranked by belief), graphAvailable flag for bare runs
- Dashboard: Belief network section in the person inspector (own pieces + top believing neighbors)
- Tests: beliefs endpoint (payload shapes, believed ≤ heard invariant, 30-cap); 273/273 green, typecheck 0 errors

## 2026-09-17 07:10 (roadmap C1 — factorial experiments)
- packages/experiments/src/factorial.ts: FactorialSpec grid → arms (baseline-first cartesian), runFactorial wraps runExperiment, main effects (level mean − grand mean), pairwise interactions (2-level diff-in-differences), markdown report; FACTORIALS registry + FTX-001 (incomeTaxRate × welfareTransferCents × schoolFundingPerPupilCents on stress.mean)
- CLI: npm run exp -- --factorial FTX-001
- FTX-001 verdict: welfare main effect −0.017 (matches EXP-030), tax +0.008, tax×welfare ≈ additive (+0.0001); SCHOOL FUNDING main effect EXACTLY 0 across all cells — the pool is chronically dry in every combination, confirming the century-report diagnosis with a clean grid experiment
- Tests: factorial.test.ts ×3 (grid/product+reserved, hand-computed effects/interaction, end-to-end report); 276/276 green, typecheck 0 errors

## 2026-09-17 08:04 (roadmap C2 — seed stability, GEN-151 deepening)
- packages/experiments/src/robustness.ts: seedStability computes PER-SEED paired effects (treatment − baseline within each seed's world), then aggregates mean/stdDev/ci95 + agreementShare + flippedSeeds; partial grids throw (no silent biasing); formatSeedStability markdown section
- CLI: npm run exp -- --id EXP-030 --stability (opt-in flag; existing reports unchanged without it)
- Real-data verdict: EXP-030 welfare effect −0.0178 ± 0.0015, agreement 3/3 seeds — the recorded conclusion is per-seed robust, not a pooled artifact
- Tests: robustness.test.ts ×3 (pooling/agreement, flip surfacing, partial-grid throw); 279/279 green, typecheck 0 errors

## 2026-09-17 09:03 (roadmap C3 — insight report generator; Phase C COMPLETE)
- apps/simulation-cli/src/insights.ts + insights-cli.ts: npm run insights -- <manifest> — stylized facts from the final snapshot across 6 lenses (demography survival/pyramid, generational turnover incl. founder extinction + dominant cohort, wealth/pension sustainability, institutions funding, belief churn/rumor share/penetration, social fabric); every fact degrades to n/a when keys are absent
- Verified on the century manifest: survival 5.2% CONTRACTION, founder generation EXTINCT, pension 0% sustainable, schools never funded, churn 92.3%, rumor share 19.9%
- Tests: insights.test.ts ×2 (full-fact derivation + n/a degradation); 281/281 green, typecheck 0 errors
- Phase C COMPLETE (C1 factorial / C2 seed stability / C3 insights) — Roadmap A→D→C fully delivered

## 2026-09-17 09:4x (roadmap follow-up — collapse robustness verification)
- Century runs on seeds 43/44/45 (each ~10-12 min, background): survival 6.0%/6.4%/5.5% — ALL reproduce the collapse; every stylized fact replicates (founder extinction, pension 100% deficit, schools never funded, wealth concentration, belief churn ~92.3%)
- CENTURY_REPORT.md appendix written: collapse upgraded from single-seed observation to structural finding (4/4 seeds, range 1.2pp)
- Fertility-marriage coupling decision now a precondition for model usability unless contraction is the research subject
