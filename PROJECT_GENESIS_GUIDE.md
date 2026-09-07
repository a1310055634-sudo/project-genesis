# Project Genesis V2：ZCode / GLM-5.3-Flash 亿级 Token 夜间高并发开发手册
> **版本**：V2.2 · High-Throughput / Idle-Queue Hardened / Single-Source-of-Truth
>
> **V2.2 变更摘要**：
> 1. 消除新旧两版指令并存：V1 的 §0 / §15.2 / §35 / §37 / §38 / Appendix B 已标记 SUPERSEDED 或改为指针。操作指令的唯一权威来源是 HT 层（HT-2 / HT-5 / HT-28 / HT-30 / HT-31）与 Appendix A。
> 2. 新增 §4.5 第一天生效的确定性硬约束（整数货币、禁墙钟时间、有序迭代、事件驱动调度、事件日志分级持久化）。
> 3. HT-22 与 HT-28 的配比合并为唯一权威表；HT-11 增加“禁止凑数”质量闸门。
> 4. Appendix 重新连续编号（原 F/G/H/I → E/F/G/H）；开跑前置检查补充“全新独立目录 + 磁盘余量”要求。

> **用途**：本文件用于指导 ZCode Agent 在一个夜间窗口内，以 **GLM-5.3-Flash** 为主要/唯一模型，对一个大型 AI 虚拟社会项目进行长时间、高并发、可验证的 Vibe Coding。
>
> **核心目标**：在平台实际额度、并发、TPM/RPM 与免费活动规则允许的前提下，为 **1 亿 Token 级甚至更高** 的真实工程工作量准备足够深的任务图，并尽量让 Token 转化为**真实可运行的软件、测试、仿真结果、性能改进、文档、审查和重构**。
>
> **重要现实约束**：本手册可以让项目拥有“足够吃掉上亿 Token 的高质量工作量”，但不能保证 ZCode/活动本身一定允许在一个晚上实际消耗 1 亿 Token。最终吞吐受账号额度、并发上限、模型速率限制、ZCode 调度策略、机器性能、任务失败与活动规则影响。**禁止为了达到数字而制造垃圾工作。**
>
> **项目代号**：`Project Genesis`
>
> **建议使用方式**：
> 1. 将本文件放到项目根目录。
> 2. 可直接将其中“项目稳定规则”部分整理/复制为根目录 `AGENTS.md`。
> 3. 在 ZCode 主任务中选择 **GLM-5.3-Flash**。
> 4. 对长时间连续推进任务使用 `/goal`。
> 5. 在允许的情况下让主 Agent 调度多个 Subagents；所有可选模型统一使用 GLM-5.3-Flash。
> 6. 不要为了消耗 Token 人为生成垃圾代码、重复文件或无意义文本。只允许通过真实工程工作扩大计算量。

---


---

# V2 核心升级：从“长任务”到“亿级 Token 工程吞吐”

这一版增加独立的 **High-Throughput Engineering Layer**，解决四个问题：

1. 如何让项目拥有足够多的真实工作，避免两小时后 Backlog 枯竭。
2. 如何让几十个独立 Agent 并行工作时不把代码库写烂。
3. 如何让大量 Token 主要消耗在高价值的实现、验证、Review、实验和重构上。
4. 如何让主 Agent 在数十轮之后仍清楚项目状态，并且能够自动续跑。

## HT-1. 亿级 Token 的吞吐数学

不要把“1 亿 Token”当一句口号。把它换算成工程吞吐目标：

```text
8 小时窗口：
100,000,000 / 8 ≈ 12.5M tokens/hour
≈ 208K tokens/minute

10 小时窗口：
100,000,000 / 10 = 10M tokens/hour
≈ 167K tokens/minute

12 小时窗口：
100,000,000 / 12 ≈ 8.33M tokens/hour
≈ 139K tokens/minute
```

因此，真正的难点不是“让一个 Agent 输出更长”，而是：

> **同时存在足够多的、互不冲突的、有价值的 Agent 工作流。**

如果 ZCode Usage 能显示实际消耗，以实际统计为准。任务内拿不到精确统计时，不得伪造 Token 数；改用以下代理指标判断吞吐：

- 活跃 Work Packages
- 每批完成任务数
- Review 数
- 测试新增数
- Experiment runs
- Benchmark runs
- Bugs found/fixed
- Integration queue 深度

---

# HT-2. Concurrency Ladder：逐级拉高并发

## Tier 0 — Bootstrap

```text
并发目标：1–4
```

处理：

- repo bootstrap
- architecture
- package boundaries
- canonical types
- simulation context
- RNG
- clock
- event contracts

核心接口不稳定时，绝不直接开几十个 Builder。

## Tier 1 — Stable Interfaces

```text
并发目标：4–8
```

进入条件：

- build green
- typecheck green
- core contracts 已存在
- first deterministic test 已通过

并行：

- psychology
- relationships
- metrics
- tests
- CLI
- dashboard shell

## Tier 2 — Domain Expansion

```text
并发目标：8–16
```

进入条件：

- 共享类型稳定
- integration tests 可运行
- 任务文件重叠率低

并行：

- family
- economy
- memory
- social graph
- education
- companies
- experiment framework
- observability

## Tier 3 — Review/Test/Experiment Saturation

```text
并发目标：16–32（仅在平台和机器稳定允许时）
```

优先把额外并发分给：

- module review
- property tests
- scenario tests
- benchmark analysis
- experiment design
- anomalous run analysis
- API audit
- refactor review
- performance profiling

## Tier 4 — Maximum Safe Saturation

```text
并发目标：平台能稳定支持的上限
```

进入条件：

- 连续两批 integration green
- merge conflict rate 低
- Ready Queue 不枯竭
- CPU/RAM/IO 没有严重饱和
- Main 能及时集成结果

如果更多并发导致更多返工，立即降级。

---

# HT-3. ZCode 调度边界

高吞吐架构采用**一层星型调度**：

```text
                         MAIN DIRECTOR
                              │
        ┌───────────┬─────────┼─────────┬───────────┐
        ↓           ↓         ↓         ↓           ↓
     Explore     Builder    Tester    Reviewer    Scientist
        ↓           ↓         ↓         ↓           ↓
      result      result    result    result       result
        └───────────┴─────────┼─────────┴───────────┘
                              ↓
                       MAIN INTEGRATION
                              ↓
                         NEXT BATCH
```

主 Agent 负责调度、整合与续跑。不要依赖递归式 Agent 树。

---

# HT-4. 吞吐面板

创建：

```text
docs/agent/THROUGHPUT.md
```

格式：

```md
# Throughput

## Current
- Current wave:
- Concurrency tier:
- Active work packages:
- Background investigations:
- Waiting reviews:
- Blocked:
- Integration queue:
- Build status:
- Last benchmark:

## Last batch
- Tasks dispatched:
- Tasks completed:
- Tasks failed:
- Reviews completed:
- Bugs found:
- Bugs fixed:
- Tests added:
- Experiments completed:
- Merge conflicts:
- Rework tasks:

## Saturation decision
- Increase concurrency / hold / decrease
- Reason:
```

仅由 Main / Integration Manager 在 Batch 边界更新，避免多人争抢状态文件。

---

# HT-5. Batch Scheduler

一个高吞吐 Batch 包含：

```text
4–32 Work Packages
+
0–8 Read-only Reviews
+
0–8 Experiments
```

具体数量随 Concurrency Tier 调整。

流程：

```text
BATCH START
│
├─ Verify main is green
├─ Freeze current contracts
├─ Select parallel-safe tasks
├─ Assign owners
├─ Launch implementation tasks
├─ Launch read-only reviews in parallel
├─ Collect early failures
├─ Integrate smallest-risk changes first
├─ Run focused tests
├─ Integrate remaining changes
├─ Run broad tests
├─ Launch post-integration reviewers
├─ Fix blockers
├─ Benchmark / experiment
├─ Update status
└─ Immediately start next batch
```

如果 Build 变红：

```text
NEW FEATURES = PAUSED
BUGFIX / DIAGNOSIS / TEST = ACTIVE
```

直到恢复 green。

---

# HT-6. 标准 Work Package

每一个真正值得消耗大量上下文的 Work Package 应包含：

```text
1. Repository reconnaissance
2. Implementation
3. Focused tests
4. Failure-path tests
5. Self-review
6. Small documentation/API update
7. Completion evidence
```

建议规模：

```text
3–15 个相关文件
1 个明确模块
1 个清晰验收目标
```

过小任务会让 Agent 启动成本大于价值；过大任务则导致边界失控。

---

# HT-7. 高价值上下文消耗

允许 Agent 深读代码，但必须与工程任务有关。

## Cross-Module Contract Review

持续安排边界 Review：

```text
Psychology ↔ Relationship
Relationship ↔ Household
Household ↔ Economy
Economy ↔ Wellbeing
Experiment ↔ Simulation
Dashboard ↔ Metrics
```

Reviewer 必须：

- 阅读双方 public API
- 检查隐式耦合
- 检查变量单位与边界
- 检查 nullability
- 检查事件顺序
- 检查错误恢复
- 给出具体 patch/test 建议

## Historical Regression Review

模块经历多轮修改后：

- 读当前实现
- 读相关 tests
- 查 semantic regression
- 增加 regression tests

## Invariant Mining

从实现中抽取隐藏约束，再转换为自动测试，例如：

```text
一个家庭不能包含不存在的人
死亡居民不能被重新雇佣
伴侣状态与 relationship edge 必须一致
所有概率值必须有界
所有 ID 引用必须 resolve
```

---

# HT-8. Review Matrix

成熟模块至少经历：

| Review | 重点 |
|---|---|
| Correctness | 状态、边界、错误路径、数值 |
| Architecture | 依赖、抽象、重复实现、接口 |
| Test | 测试盲区、弱断言、edge cases |
| Performance | 热点、复杂度、内存、批处理 |

核心模块额外增加：

| Review | 重点 |
|---|---|
| Determinism | RNG、排序、时间、并发 |
| Simulation Validity | 机制是否符合设计意图 |
| Data Integrity | 引用、持久化、一致性 |

让 Reviewer 独立审查，由 Main 合并结论，避免“互相附和式 Review”。

---

# HT-9. 高风险算法可做双方案挑战

仅适用于：

- seeded RNG adapter
- event replay
- relationship state machine
- experiment aggregation
- statistical utilities
- graph algorithms

流程：

```text
Agent A：方案 A
Agent B：独立方案 B
Reviewer：比较
Main：保留一个 canonical implementation
```

另一方案不直接合并。

禁止所有模块普遍双写，否则会形成重复架构。

---

# HT-10. 自动任务工厂

为了避免凌晨 Backlog 枯竭，Main 从以下来源持续生成真实工程任务：

## A. Roadmap 未实现能力
把 feature 拆成具体验收任务。

## B. Test gaps
扫描：
- 未测试 public API
- 缺 failure paths
- 缺 invariant
- 缺 property tests

## C. Architecture debt
扫描：
- circular dependencies
- giant files
- god classes
- duplicate types
- hidden globals
- cross-package private imports

## D. Simulation anomalies
批量模拟发现：
- NaN
- overflow
- impossible state
- runaway loops
- relationship explosion
- empty market
- broken references

每一个 anomaly 生成调查任务。

## E. Performance hotspots
Benchmark/profile 后生成优化任务。

## F. Experiment questions
从现有模型机制生成内部可检验问题。

## G. Dashboard observability gaps
模型中存在但 UI 完全不可见的重要状态，生成可视化任务。

---

# HT-11. Backlog 容量

建议持续保持：

```text
Ready Queue：40–120 个有明确定义的任务
Idea Queue：100–300 个候选
Active：按 Concurrency Tier
Blocked：独立维护
```

Ready task 必须包括：

```text
Goal
Domain
Dependencies
Parallel-safe
Acceptance
Validation
Expected touched area
```

禁止一次生成几千条没有验收标准的 TODO。

如果 Ready Queue 暂时低于下限，允许它暂时低于 40 并由 Task Factory 持续补充；
**禁止为凑数量降低任务质量、省略 Acceptance 或注水拆分。** 队列深度不足永远不是制造垃圾任务的理由。

---

# HT-12. 大型任务储备域

当基础功能完成后继续扩展：

## Demography
fertility / mortality / migration / cohort / population pyramid

## Education
school assignment / attainment / skill / dropout / occupational matching

## Labor
job search / vacancy matching / promotion / layoffs / career transitions / wage distribution

## Housing
stock / demand / rent / affordability / relocation / neighborhood effects

## Social Network
homophily / triadic closure / tie decay / centrality / support / diffusion

## Media
synthetic news / exposure / belief update / rumor diffusion / attention

## Institutions
schools / firms / public services / taxation / welfare / legal abstraction

## Geography
neighborhoods / commute / distance / local opportunities

## General Health Abstraction
只做一般状态变量与功能限制，不进行真实临床诊断。

## Narrative
resident biography / city newspaper / historical timeline / notable events / explainable traces

---

# HT-13. 心理学深度扩展

## Personality
- Big Five generation
- correlated traits
- trait stability
- life-event modulation
- behavioral moderators

## Affect
- valence
- arousal
- positive/negative affect
- decay
- event response
- mood inertia

## Stress
- acute/chronic stress
- accumulation
- recovery
- appraisal
- resource buffers

## Coping
- problem-focused
- emotion-focused
- avoidance abstraction
- efficacy learning

## Self
- self-esteem
- perceived control
- self-efficacy abstraction
- social comparison

## Relationships
- trust
- intimacy
- support
- commitment
- conflict
- repair

## Motivation
- needs
- goals
- priority
- approach/avoidance
- effort allocation

## Memory
- episodic events
- salience
- decay
- retrieval probability
- relationship summaries

每个模块最低要求：

```text
domain.md
types
update function
parameter schema
unit tests
property tests
validation scenarios
```

---

# HT-14. Simulation Validity Harness

建立：

```text
packages/validation/
```

目标是验证 Genesis 内部机制是否符合设计，不是假装证明现实世界。

## Monotonic scenario

```text
提高 financial strain
其他条件固定
aggregate stress 不应系统性下降
```

## Boundary scenario

```text
stress=max
继续施压
必须 finite 且保持合法范围
```

## Recovery scenario

```text
移除 stressor
推进时间
stress 按模型设计恢复
```

## Moderator scenario

```text
相同 stressor
高 social support 组
平均负面影响应弱于低 support 组
```

每个 scenario：
- 多 seeds
- 输出 effect direction
- 保存失败 seed
- 验证 aggregate behavior
- 不要求每个个体完全同方向

---

# HT-15. Nightly Experiment Factory

每个 Experiment Pack：

```text
Scientist 提问
→ Reviewer 检查模型能否回答
→ 生成配置
→ smoke run
→ multi-seed run
→ Analyzer 汇总
→ Skeptic 查混淆/实现 bug
→ 增加控制
→ rerun
→ report
→ 缺陷回流工程 Backlog
```

种子数量逐级：

```text
10 → 30 → 100
```

不要一开始就做超大批量运行。

---

# HT-16. Experiment Catalog

```text
EXP-001 Financial strain → stress
EXP-002 Social support × stress
EXP-003 Unemployment → wellbeing
EXP-004 Job loss → relationship conflict
EXP-005 Chronic stress → social withdrawal
EXP-006 Extraversion → network growth
EXP-007 Agreeableness → conflict repair
EXP-008 Neuroticism × adverse event → affect
EXP-009 Housing burden → wellbeing
EXP-010 Income volatility → stress
EXP-011 Social isolation → wellbeing
EXP-012 Friendship support → recovery
EXP-013 Relationship conflict → work performance abstraction
EXP-014 Education → occupational opportunity
EXP-015 Economic shock → unemployment
EXP-016 Unemployment duration → wealth
EXP-017 Wealth buffer × job loss
EXP-018 Neighborhood opportunity → employment
EXP-019 Homophily → network segregation
EXP-020 Tie decay → network fragmentation
EXP-021 Information diffusion speed
EXP-022 Rumor persistence
EXP-023 Household size → expense burden
EXP-024 Parenthood → household budget
EXP-025 Retirement transition
EXP-026 Population aging → dependency ratio
EXP-027 Fertility parameter sweep
EXP-028 Mortality parameter sweep
EXP-029 Wage inequality sweep
EXP-030 Policy transfer abstraction
```

---

# HT-17. Package Ownership

仓库扩大后，为重要 package 建：

```text
packages/<domain>/OWNERS.md
```

内容：

```md
# Domain Ownership

## Purpose
## Canonical types
## Public API
## Allowed dependencies
## Forbidden dependencies
## Important invariants
## Test commands
## Known performance concerns
```

Worker 修改前必须读取。

---

# HT-18. Contract Freeze Window

每个 Batch 启动时：

```text
Core contracts = frozen
```

Batch 内如果必须 breaking change：

```text
暂停相关 tasks
→ architect 定义 canonical contract
→ migration
→ compile/test
→ 恢复 tasks
```

共享接口不能在高并发期间频繁漂移。

---

# HT-19. Merge Queue

维护：

```text
docs/agent/MERGE_QUEUE.md
```

推荐集成顺序：

```text
1. Independent tests/docs
2. Leaf packages
3. Domain packages
4. Cross-domain integration
5. Core changes
```

每合并 2–5 个相关 change：

- typecheck
- focused tests

每个 Batch：

- full test
- invariant
- deterministic smoke

---

# HT-20. Conflict Budget

统计：

```text
merge_conflicts / completed_tasks
```

如果连续两个 Batch > 20%：

- 降并发
- 减少 shared-file edits
- 冻结 contracts
- 强化 package ownership

---

# HT-21. Failure Budget

统计：

```text
failed_or_reworked_tasks / dispatched_tasks
```

建议判断：

```text
<15%   healthy
15–30% investigate
>30%   reduce concurrency / improve task specs
```

避免进入“返工吞吐”的假繁荣。

---

# HT-22. 工作预算（唯一权威配比表）

不是精确 Token 计费，而是任务比例。**这是全手册唯一的配比权威表（HT-28 与 Master Prompt V2 均引用它，不得另立数字）：**

```text
Implementation / Refactor      50%
Tests                          20%
Independent Review             15%
Experiment / Validation        10%
Performance / Docs              5%
```

聚合视角（同一张表的健康度分组）：

```text
Build / Refactor   = 50%
Verification       = 45%（Tests + Review + Experiment/Validation）
Support            =  5%（Performance / Docs）
```

如果代码量快速增长、验证没跟上（source growth >> verification growth）：

> 下一批自动提高 Tests / Review / Experiment 比例。

---

# HT-23. 反代码膨胀指标

Nightly Report 至少记录：

```text
features completed
tests added
bugs found
bugs fixed
integration scenarios
benchmarks
experiments
source files
test files
```

发现：

```text
source_growth >> verification_growth
```

则下一批切换为：

```text
review + test + refactor
```

---

# HT-24. Context Rotation

每个大 Wave 边界保持最新：

```text
ARCHITECTURE.md
ROADMAP.md
DECISIONS.md
docs/agent/ACTIVE.md
docs/agent/BLOCKED.md
docs/agent/THROUGHPUT.md
docs/agent/NIGHTLY_REPORT.md
```

上下文压缩或新会话后恢复流程：

```text
读 AGENTS.md
→ 读 ROADMAP
→ 读 ARCHITECTURE
→ 读 ACTIVE/BLOCKED
→ 检查 Git
→ smoke test
→ 恢复调度
```

---

# HT-25. 自定义 Subagent 模板

推荐让 Subagent **继承主模型**，从而保持 GLM-5.3-Flash。

Reviewer：

```md
---
name: genesis-reviewer
description: Independent correctness and architecture reviewer
model: inherit
maxTurns: 30
injectAgentsMd: true
---

Read only the assigned scope and related tests.

Return findings as:
BLOCKER / HIGH / MEDIUM / LOW

Every finding must include:
- file/symbol
- concrete failure mode
- why it matters
- minimal fix direction
- test that catches it

Do not invent findings.
```

Performance：

```md
---
name: genesis-performance
description: Profile-driven simulation performance engineer
model: inherit
maxTurns: 40
injectAgentsMd: true
---

For every optimization:
- record baseline
- identify hotspot
- patch
- run correctness tests
- benchmark again
- report before/after
```

Scientist：

```md
---
name: genesis-scientist
description: Internal simulation experiment designer and analyst
model: inherit
maxTurns: 40
injectAgentsMd: true
---

Treat Genesis as a computational model, not real-world truth.

For each experiment:
- state internal hypothesis
- identify variables/controls
- use multiple seeds
- smoke test first
- analyze aggregate result
- inspect unexpected outputs for implementation bugs
```

---

# HT-26. Background Queue

适合后台：

- repository-wide duplicate search
- test-gap audit
- dependency audit
- performance investigation
- architecture review
- experiment analysis
- docs consistency audit

适合前台：

- merge blocker
- failing build diagnosis
- contract migration
- urgent interface decisions

Main 不要因为一个后台 Reviewer 未返回而空等。

---

# HT-27. 亿级工作量储备

| Area | 可产生的高质量 Work Packages |
|---|---:|
| Simulation Core | 20–40 |
| Determinism / Replay | 15–30 |
| Person / Lifecycle | 20–40 |
| Psychology | 60–120 |
| Relationships | 40–80 |
| Family | 20–40 |
| Economy | 60–120 |
| Education | 20–40 |
| Housing | 30–60 |
| Companies / Labor | 40–80 |
| Social Network | 30–60 |
| Institutions | 30–80 |
| Experiments | 60–150 |
| Validation | 40–100 |
| Performance | 30–80 |
| Dashboard | 30–60 |
| Data / Persistence | 20–50 |
| QA / Property Tests | 50–120 |
| Red Team | 30–80 |
| Documentation / API | 20–40 |

总工作储备大约：

```text
700–1,400 个可认真完成/验证的 Work Packages
```

它远超一个夜晚正常能完成的数量，所以无需制造垃圾任务。

---

# HT-28. HIGH-THROUGHPUT MODE

Bootstrap 完成后进入：

```text
GENESIS HIGH-THROUGHPUT MODE
```

Main 循环：

```text
IF build red:
    dispatch diagnosis + fix + regression
ELSE:
    keep Ready Queue >= 40
    choose highest stable concurrency tier

    allocate per the canonical ratio table in HT-22:
      50% implementation/refactor
      20% tests
      15% independent review
      10% experiment/validation
       5% performance/docs

    launch independent work

    while background work runs:
      integrate completed low-risk work
      refine Ready Queue
      run local verification

    at batch boundary:
      full typecheck
      test
      invariant
      deterministic smoke
      benchmark sample

    update throughput
    immediately start next batch
```

---

# HT-29. 防提前结束

只要以下任意一项未达成，Main 不应将最低 Goal 判断完成：

- scale target
- deterministic replay
- invariant suite
- psychology integration
- relationships
- economy
- dashboard reads real state
- experiment runner
- benchmark
- Red Team blocker cleanup

最低目标完成后进入 Stretch Queue：

```text
validation depth
performance
experiments
education
housing
institutions
property tests
red team
architecture debt
dashboard observability
```

---

# HT-30. 亿级 Token Goal V2

推荐替换旧 `/goal`：

```text
/goal 持续推进 Project Genesis 的高吞吐夜间开发。在保持 main/集成分支可恢复、所有关键随机行为可复现、核心测试持续通过的前提下，建立并持续消费一个不少于 40 个 Ready Work Packages 的真实工程队列；根据稳定性逐步提高互不冲突任务的并发度，并持续并行执行实现、测试、独立 Review、性能验证与多 seed 仿真实验。最低产品目标是：固定 seed 创建至少 10,000 名居民，稳定模拟至少 10 年，贯通人格/压力/情绪、人际关系、家庭、职业/收入/财富，提供真实状态 Dashboard、deterministic replay、全局 invariant suite、experiment runner 和 benchmark。达到最低目标后不要立即结束，继续从验证、性能、实验、社会制度、测试盲区和 Red Team 发现中生成新的有验收标准的 Work Packages 并推进，直到用户停止、平台/活动额度阻止继续、出现必须由用户决定的高风险阻塞，或不存在任何安全且有价值的工程工作。禁止通过重复文本、复制实现、空文件、无意义测试或重复读取来人为消耗 Token。
```

---

# HT-31. MASTER PROMPT V2

## MASTER PROMPT V2 BEGIN

你是 Project Genesis 的 **Director / Scheduler / Integration Owner**。

今晚使用 **GLM-5.3-Flash** 进行长程、高吞吐工程开发。

你的目标不是单独写尽可能多代码，而是组织一个持续运行的软件工程流水线，使实现、测试、Review、性能验证、仿真实验和修复能够在安全的情况下并行发生。

### 第一原则

项目质量和可恢复性是硬约束。

禁止为了增加 Token 使用而：
- 重复生成代码
- 建平行重复架构
- 生成空文件
- 写无效测试
- 重复相同 Review
- 无理由反复读取整个仓库
- 进行没有证据的重构

大量 Token 应来自真实复杂工作。

### 模型

主会话保持 GLM-5.3-Flash。

所有可以设置的 Subagents 使用 `model: inherit` 或明确保持 GLM-5.3-Flash。

未经用户授权不得换用其他收费模型。

### 启动

立即：

1. 阅读 AGENTS.md。
2. 检查 Git。
3. 检查 build/typecheck/test。
4. 阅读 ARCHITECTURE/ROADMAP/agent status。
5. 若不存在状态文件则建立。
6. 建立 `docs/agent/THROUGHPUT.md`。
7. 建立不少于 40 项、带 Acceptance 的 Ready Queue。
8. 判断当前 Concurrency Tier。
9. 发出第一批 parallel-safe Work Packages。

不要写完宏大计划就停止。

### 调度拓扑

你是唯一顶层调度者。

使用一层并行：
- Explore
- Builder
- Tester
- Reviewer
- Performance
- Scientist
- Red Team

优先把长调查放后台；立即决定接口的任务放前台。

### 并发阶梯

Bootstrap：1–4  
Stable interfaces：4–8  
Domain expansion：8–16  
Review/Test/Experiment saturation：16–32，仅在环境稳定时  
更高：仅平台稳定支持时使用

如果 merge conflict、测试失败、integration queue 或机器负载恶化，立即降低并发。

### 每批任务配比

默认：
- 50% implementation/refactor
- 20% tests
- 15% independent review
- 10% experiment/validation
- 5% performance/docs

如果 source growth 明显超过 verification growth，提高 tests/review 比例。

### 每个任务

必须：

```text
Explore
→ Plan
→ Implement
→ Test
→ Self Review
→ Evidence
```

中大型任务增加 Independent Review。

任何新 abstraction 创建前先全局搜索。

### Batch

每批：

```text
main green
→ freeze contracts
→ dispatch
→ collect
→ integrate
→ focused tests
→ broad tests
→ invariant
→ deterministic smoke
→ review
→ fix
→ benchmark/experiment
→ status update
→ next batch
```

### Ready Queue

保持 40–120 个 Ready tasks。

低于 40 时从：
- roadmap
- test gaps
- architecture debt
- anomalies
- profile
- experiments
- dashboard gaps

自动补充。

每个任务必须有：
- domain
- goal
- dependency
- parallel-safe
- acceptance
- validation

### 核心质量闸门

Build 红：暂停相关新 feature。  
Determinism 红：先修复随机/重放。  
Invariant 红：先修状态破坏。  
Benchmark 显著退化：先定位原因。

### 最低目标

至少：
- 10,000 residents
- 10 simulated years
- seeded RNG
- deterministic replay
- psychology
- relationships
- household/family
- job/income/wealth
- dashboard
- experiment runner
- invariant suite
- benchmark
- nightly report

### 最低目标之后

继续：
- validation harness
- property testing
- multi-seed experiments
- performance
- education
- housing
- firms/labor
- social network
- institutions
- red team
- architecture debt
- dashboard observability

### Simulation Science

心理与社会模块是简化计算模型。

不能把 simulation 输出描述为现实因果证明。

重要 mechanism 必须有：
- bounds
- update rule
- tests
- validation scenario
- simplifications

### 高吞吐原则

当存在安全且互不冲突的工作：

不要让主 Agent 空闲等待单个 Subagent。

继续：
- refine backlog
- integrate completed work
- dispatch read-only audits
- run experiments
- inspect failures
- prepare next batch

### 状态恢复

每个大 Batch 更新：
- ROADMAP
- ACTIVE
- BLOCKED
- THROUGHPUT
- NIGHTLY_REPORT

关键事实必须写入仓库。

### 停止条件

整个 Goal 只在以下情况停止：

1. 用户明确停止。
2. 平台/活动额度或技术限制无法继续。
3. 所有剩余工作都需要高风险/不可逆/付费/敏感操作。
4. 不存在任何安全且有价值的工程工作。

局部 blocked task 不是停止理由。

现在开始执行，不要只输出计划。

## MASTER PROMPT V2 END

---

# HT-32. 第二天早上的独立质量审计

安排 5 个独立 Reviewer。

## Reviewer 1 — Can it run?
- fresh install
- build
- test
- simulation
- dashboard

## Reviewer 2 — Is it one architecture?
重点搜：
- duplicate Person
- duplicate RNG
- duplicate event bus
- duplicate stores
- duplicate relationship models

## Reviewer 3 — Are tests real?
随机抽取至少 30 个 tests，检查：
- 是否真正触发业务逻辑
- 是否存在弱断言
- 破坏实现后是否会失败

## Reviewer 4 — Is simulation sane?
执行多个 seeds 和代表性 scenarios，检查：
- invalid state
- NaN/overflow
- distribution explosion
- broken references

## Reviewer 5 — Was the scale fake?
检查：
- 10k 是否真的参与 simulation
- 10 years 是否推进了所有主要系统
- Dashboard 是否读真实 state
- Experiment 是否真的 multi-seed
- Benchmark 是否真实测量

最终结论：

```text
PASS
PASS WITH ISSUES
FAIL
```

问题全部回流 Backlog。

---

# HT-33. 健康的超大夜间运行应留下什么

不应该只是：

```text
+500,000 lines
```

而应同时看到：

```text
Core simulation              GREEN
Deterministic replay         GREEN
Invariant suite              GREEN
Population 10k               GREEN
10-year simulation           GREEN
Psychology integration       GREEN
Relationship integration     GREEN
Economy integration          GREEN
Experiment runner            GREEN
Dashboard                    GREEN

Tests                        持续增长
Property/invariant suites    持续增长
Benchmarks                   有版本记录
Experiments                  多批次
Review findings              可追踪
Known issues                 明确
Backlog                      仍然有深度
```

真正标准是：

> **代码、验证、实验和工程状态一起增长。**


# 0. 给所有 Agent 的最高优先级规则

> **V2.2 起本节不再是独立规则源（SUPERSEDED，改为指针）。** 操作规则的唯一权威来源：
>
> - 主 Agent：**HT-31 MASTER PROMPT V2**（本文件中唯一有效的 Master Prompt；§38 旧版已删除）。
> - 所有 Subagent：项目根目录 `AGENTS.md`（以 **Appendix A 精简版**为基准生成）。
> - 并发 / 批次 / 夜间循环：**HT-2 / HT-5 / HT-28**（§15.2 与 §35 已作废）。
> - Goal：**HT-30 亿级 Token Goal V2**（§37 与 Appendix B 的旧 Goal 已作废）。
>
> 全局底线摘要（完整表述以权威来源为准）：
>
> - 不为消耗 Token 制造垃圾工作；先搜索再创建抽象，严禁平行重造已有系统。
> - 所有随机性走 seeded RNG；模拟核与 UI 解耦；心理模型是简化计算模型，不冒充临床工具、不泛化为现实结论。
> - 居民数据一律合成，不使用真实个人数据；不删除用户文件、不泄露密钥、不执行破坏性系统命令。
> - 模型统一 GLM-5.3-Flash；未经用户授权不换用其他收费模型；模型能力不足时拆小问题、多轮验证，而不是偷偷换模型。

---

# 1. 项目愿景

Project Genesis 是一个：

> **The Sims × RimWorld × Civilization × Agent-Based Computational Social Science**

风格的虚拟社会实验平台。

系统需要能够在普通开发机器上运行大量居民，同时允许部分高价值行为调用 AI/LLM 决策层。

核心思想：

1. **大多数社会行为由确定性/概率性模拟引擎执行。**
2. **LLM 只负责少量高层、复杂、语言化或特殊事件决策。**
3. **所有关键社会变量必须可追踪。**
4. **模拟必须尽可能可复现。**
5. **所有宏观现象应尽可能由微观规则涌现，而非直接硬编码结论。**
6. **心理学模块需要明确区分“理论启发的计算模型”和“真实临床判断”。**
7. **系统允许进行批量实验、Monte Carlo 重复模拟和统计分析。**

---

# 2. 第一夜总体目标

第一夜不要求“做完整个世界”。

第一夜的成功标准是建立一个足够坚固的大型工程骨架，并完成若干贯通式功能。

## 2.1 第一夜最低成功条件

至少实现：

- [ ] 项目可以一键安装依赖。
- [ ] 项目可以一键启动开发环境。
- [ ] 项目可以一键执行测试。
- [ ] 项目可以创建至少 10,000 个虚拟居民。
- [ ] Simulation Clock 可以推进时间。
- [ ] 支持固定随机种子。
- [ ] 相同 seed + 相同配置可以得到可重复结果。
- [ ] 居民具备基础人格、需求、情绪和生命周期状态。
- [ ] 存在 Household / Family。
- [ ] 存在 Relationship Graph。
- [ ] 存在 Job / Employer / Income。
- [ ] 存在基础消费、财富变化。
- [ ] 存在事件总线或等效事件系统。
- [ ] 可以运行至少 1 年模拟时间。
- [ ] 可以导出关键指标。
- [ ] Dashboard 可以查看全局指标。
- [ ] Dashboard 可以查看单个居民档案。
- [ ] 具备单元测试、集成测试、基础性能测试。
- [ ] 文档记录当前架构、运行方式和已知限制。

## 2.2 第一夜进阶目标

如果最低目标提前完成，继续推进：

- [ ] 100 年仿真。
- [ ] 10,000 人 × 100 年在合理时间内完成。
- [ ] 恋爱 / 婚姻 / 分手。
- [ ] 生育 / 家庭结构变化。
- [ ] 教育与职业路径。
- [ ] 公司创建与破产。
- [ ] 房屋 / 租赁 / 住房支出。
- [ ] 社会网络形成。
- [ ] 社会支持。
- [ ] 压力与应对。
- [ ] 依恋相关参数。
- [ ] 长期记忆。
- [ ] 新闻 / 舆论事件。
- [ ] 仿真实验框架。
- [ ] Monte Carlo 多次重复实验。
- [ ] 自动统计报告。
- [ ] 性能 profiling。
- [ ] Red Team / Blue Team 工程审查。

---

# 3. 技术原则

除非已有项目技术栈，否则建议采用：

## 3.1 Monorepo

```text
project-genesis/
├── AGENTS.md
├── README.md
├── ROADMAP.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── CHANGELOG.md
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/
│   ├── api/
│   └── simulation-cli/
├── packages/
│   ├── core/
│   ├── simulation/
│   ├── psychology/
│   ├── social/
│   ├── relationships/
│   ├── economy/
│   ├── institutions/
│   ├── experiments/
│   ├── analytics/
│   ├── shared/
│   └── test-utils/
├── data/
│   ├── fixtures/
│   └── seeds/
├── scripts/
├── tests/
├── benchmarks/
└── docs/
```

推荐默认技术栈：

- TypeScript
- Node.js
- pnpm workspaces
- Web：React / Next.js 或 Vite
- API：Fastify / equivalent lightweight framework
- Simulation Engine：纯 TypeScript package，避免 UI 与核心仿真耦合
- 数据：开始阶段允许 SQLite / embedded database；规模扩大后可迁移 PostgreSQL
- 测试：Vitest/Jest + integration tests
- 属性测试：fast-check 或等效工具
- 图表：轻量图表库
- 关系图：图数据结构先在核心中抽象，UI 可后接可视化库

如果已有技术栈：

> **禁止为了遵循本指南而无理由重写项目。优先适配现有结构。**

---

# 4. 核心架构约束

## 4.1 Simulation Core 必须与 UI 解耦

核心模拟必须能够：

```bash
pnpm sim --seed 42 --population 10000 --years 10
```

在不启动网页的情况下运行。

UI 只负责：

- 启动/暂停模拟
- 查看状态
- 显示指标
- 查看居民
- 查看关系
- 查看事件
- 配置实验

不得把核心社会逻辑写进 React component。

---

## 4.2 时间模型

建立统一 Simulation Clock。

推荐基本单位：

```text
Tick
→ Hour
→ Day
→ Week
→ Month
→ Year
```

不同系统可以订阅不同频率：

- emotion decay：小时/天
- consumption：天/周
- salary：月
- job market：周/月
- relationship updates：天/周
- demographics：天/月
- macro metrics：月/年

禁止每个模块自己维护一套互不兼容的时间。

---

## 4.3 随机性

所有随机行为必须来自可注入 RNG。

禁止：

```ts
Math.random()
```

散落在业务逻辑。

必须：

```ts
ctx.rng.next()
```

或等效抽象。

要求：

- Seed 可指定。
- 测试可固定 seed。
- 实验可以生成 seed 集合。
- 失败实验应记录 seed。
- Bug 可以通过 seed 重放。

---

## 4.4 Event System

推荐定义：

```ts
interface SimulationEvent<T = unknown> {
  id: string
  type: string
  tick: number
  actorIds: string[]
  payload: T
  metadata?: Record<string, unknown>
}
```

事件示例：

```text
person.born
person.died
job.started
job.ended
income.received
relationship.started
relationship.ended
marriage.created
household.created
stress.changed
company.created
company.closed
education.completed
```

事件应尽量：

- typed
- append-friendly
- 可统计
- 可测试
- 可回放/审计

---

## 4.5 第一天生效的确定性硬约束（Day-One Hard Constraints）

以下约束必须在 Wave 1 第一批代码中生效，不允许“先实现、后返工”：

1. **货币一律整数最小单位**（例如“分”）。禁止用浮点表示金钱；金额运算只允许整数加减与显式舍入策略的整数乘除。
2. **核心层禁用墙钟时间**。核心模拟逻辑禁止 `Date.now()` / `new Date()`；一切“当前时间”只能来自 Simulation Clock。墙钟时间只允许出现在 Observability / 日志层。
3. **迭代必须有序**。遍历 `Map` / `Set` / 对象键必须显式排序（如按 id）或使用插入序稳定结构；禁止依赖哈希序。序列化/持久化的字段顺序同样必须稳定。
4. **事件驱动调度**。实体默认“睡眠”，只在被调度到的 tick（next-fire time）被唤醒；禁止把“每个 tick 对全量人口做 O(N) 扫描”作为常规更新路径。§4.2 的分频订阅通过该调度器实现。
5. **事件日志分级持久化**。热数据全量写入；冷数据按 tick/天聚合归档并可裁剪。metrics 聚合结果保留全历史，原始事件只保留滚动窗口或关键采样。10k × 100 年不允许原始事件无上限累积。

这五条是 deterministic replay 与 10k × 100 年可行性的前提，纳入 Invariant Suite（§27）检查；Red Team 发现违反时按 P0 处理。

---

# 5. Domain Model

## 5.1 Person

居民至少包含：

```text
Identity
├── id
├── age
├── sex/gender representation（保持模型可配置）
├── household
├── location
└── life stage

Personality
├── openness
├── conscientiousness
├── extraversion
├── agreeableness
└── neuroticism

Psychology
├── affect
├── stress
├── needs
├── self-esteem
├── coping resources
├── attachment parameters
└── subjective well-being

Economy
├── occupation
├── employer
├── income
├── wealth
├── expenses
└── housing

Social
├── relationships
├── social support
├── reputation
└── group memberships

Memory
├── salient events
├── relationship memories
└── long-term summaries
```

**原则：**

不要把所有数据塞进单个巨型 `Person` class。

优先组件化：

```text
PersonEntity
+ PersonalityComponent
+ EmotionComponent
+ EconomicComponent
+ SocialComponent
+ MemoryComponent
```

---

# 6. Psychology Package

心理系统必须单独放置，例如：

```text
packages/psychology/
├── personality/
├── affect/
├── stress/
├── coping/
├── needs/
├── attachment/
├── self-esteem/
├── social-comparison/
├── attribution/
├── decision/
├── memory/
├── wellbeing/
└── validation/
```

## 6.1 心理模型设计原则

每个心理模块至少应记录：

1. 模型目的。
2. 输入变量。
3. 输出变量。
4. 更新频率。
5. 参数范围。
6. 随机部分。
7. 理论来源/理论灵感说明。
8. 已知简化。
9. 单元测试。
10. 与其他模块交互接口。

### 示例：Stress

不要写：

```ts
if (unemployed) stress += 50
```

更推荐：

```text
stress_delta =
  financial_strain * w1
+ relationship_conflict * w2
+ occupational_strain * w3
+ adverse_events * w4
- social_support * w5
- coping_resources * w6
+ stochastic_noise
```

随后经过：

- clamp
- decay
- individual sensitivity
- neuroticism moderation
- chronicity accumulation

### 示例：Relationship Satisfaction

可以综合：

```text
positive_interactions
negative_interactions
trust
perceived_support
conflict
similarity
attachment dynamics
shared stress
relationship history
```

但任何模型都不能假装自己是现实世界的完整心理定律。

---

# 7. 社会关系系统

关系不是简单的 `friend: true/false`。

推荐：

```ts
RelationshipEdge {
  personA
  personB
  familiarity
  liking
  trust
  intimacy
  attraction
  conflict
  dependency
  support
  commitment
  history
  lastInteractionTick
}
```

关系类型可由状态推导或显式状态机维护：

```text
stranger
acquaintance
friend
close_friend
dating
partner
married
separated
ex_partner
enemy
family
coworker
```

## 7.1 Interaction Engine

一次互动至少考虑：

```text
当前情绪
人格
双方历史
关系质量
情境
压力
目标
随机扰动
```

输出：

```text
情绪变化
关系指标变化
记忆
事件
未来互动概率变化
```

---

# 8. 生命周期与家庭

实现：

```text
birth
childhood
education
adolescence
adulthood
employment
partnership
marriage
parenthood
aging
death
inheritance
```

家庭至少支持：

- 单人家庭
- 伴侣家庭
- 亲子家庭
- 单亲家庭
- 多代家庭（后续）
- 家庭拆分
- 家庭合并

不要把“结婚 = 创建家庭”写死为唯一规则。

---

# 9. 经济系统

逐层实现。

## Phase E1

```text
job
salary
income
basic expenses
wealth
unemployment
employer
```

## Phase E2

```text
labor market
job matching
skill
education premium
company finances
hiring
layoff
```

## Phase E3

```text
housing
rent
mortgage-like abstraction
consumption categories
savings
inheritance
tax
```

## Phase E4

```text
business cycle
productivity
inflation abstraction
credit
wealth inequality
policy shocks
```

宏观指标必须从个体状态聚合，不应直接手工设置结果。

---

# 10. 机构系统

后续扩展：

```text
schools
companies
government
health services
media
law
police
courts
banks
housing market
```

每个机构模块必须：

- 有明确输入/输出。
- 不直接偷偷修改其他模块私有状态。
- 尽量通过 command / event / service interface 交互。
- 保持可替换性。

---

# 11. AI / LLM 层

不要为所有居民每个 tick 调用 LLM。

这是不可扩展的。

采用分层决策：

## Level 0：纯规则

高频、低价值行为：

```text
吃饭
睡眠
基础消费
通勤
工资结算
年龄增长
```

## Level 1：Utility / stochastic decision

例如：

```text
是否参加社交活动
是否寻找工作
是否联系朋友
消费偏好
```

## Level 2：复杂决策模型

例如：

```text
是否辞职
是否搬家
是否开始/结束关系
```

## Level 3：LLM

只用于：

- 重大人生事件
- 高复杂度冲突
- 对话生成
- 新闻/叙事
- 特殊 NPC
- 研究样本
- Debug explanation

LLM 结果尽量转化为结构化输出：

```json
{
  "decision": "...",
  "confidence": 0.72,
  "reasons": ["..."],
  "state_changes": []
}
```

业务逻辑必须验证 LLM 输出。

---

# 12. 数据与隐私

默认：

- 所有居民都是虚构数据。
- 不导入真实个人聊天记录。
- 不模拟具体真实私人个体。
- 不存储真实敏感身份信息。
- 测试 fixture 采用 synthetic data。
- 密钥只从环境变量读取。
- `.env` 不提交 Git。
- 创建 `.env.example`。

---

# 13. Agent 组织结构

不要让所有 Agent 都做任何事情。

采用分层：

```text
                  MAIN / DIRECTOR
                        │
                    ARCHITECT
                        │
      ┌─────────────────┼─────────────────┐
      │                 │                 │
  SIMULATION         DOMAIN            PLATFORM
      │                 │                 │
      ├ Psychology      ├ Economy          ├ Web
      ├ Social          ├ Institutions     ├ API
      ├ Relations       ├ Demography       ├ Data
      └ Memory          └ Experiments      └ DevOps
                        │
                 INTEGRATION / QA
                        │
              RED TEAM / REVIEWERS
```

---

# 14. 推荐 Subagent 角色

如果 ZCode 支持自定义 Subagent，建议创建以下角色。

所有角色模型统一：

```text
GLM-5.3-Flash
```

## 14.1 architect

职责：

- 架构评审
- 模块边界
- API contract
- 依赖方向
- ADR
- 防止重复造轮子

限制：

- 优先读代码。
- 不应随意进行大型实现。
- 输出必须引用具体文件和接口。

---

## 14.2 explorer

职责：

- 在修改前搜索已有实现。
- 查找相关类型。
- 查找测试。
- 追踪调用链。
- 标记重复风险。

每一个中大型开发任务开始前，优先由 Explore 类角色完成一次代码库侦察。

---

## 14.3 implementer

职责：

- 实现单个清晰 feature。
- 写测试。
- 跑测试。
- 修复失败。
- 汇报修改文件。

限制：

- 不做无关重构。
- 不改变公共接口除非任务要求。

---

## 14.4 test-engineer

职责：

- 单测
- 集成测试
- 属性测试
- regression test
- edge cases
- deterministic replay test

原则：

测试必须能发现真实缺陷，而不是只覆盖 happy path。

---

## 14.5 reviewer

职责：

仅针对已有 diff：

- correctness
- architecture
- maintainability
- duplicate implementations
- performance
- tests
- error handling
- types

输出必须区分：

```text
BLOCKER
HIGH
MEDIUM
LOW
NIT
```

---

## 14.6 performance-engineer

职责：

- profiling
- benchmark
- memory
- algorithmic complexity
- hot paths
- database queries
- batch processing

目标：

让：

```text
10,000 residents × long simulation
```

逐渐成为可实际运行的目标。

---

## 14.7 psychology-modeler

职责：

- 设计心理变量的计算表示。
- 检查变量范围。
- 检查动态更新。
- 检查概念混淆。
- 防止把理论写成简单标签。
- 写 validation scenarios。

不得：

- 对真实用户进行诊断。
- 将简化模型声称为临床工具。

---

## 14.8 experiment-scientist

职责：

- 提出可检验假设。
- 创建实验配置。
- 运行多 seed 模拟。
- 汇总指标。
- 检查模型机制。
- 输出实验报告。

---

## 14.9 red-team

职责：

主动寻找：

- 架构漏洞
- 并发问题
- 不可复现
- 数值爆炸
- 数据泄漏
- 概率错误
- 不合理状态
- 性能退化
- 测试盲区
- silent failure

禁止无证据泛泛批评。

---

## 14.10 integration-manager

职责：

- 检查各模块 contract。
- 解决冲突。
- 跑全量验证。
- 更新状态文档。
- 确保 main 始终可运行。

---

# 15. 并发策略

## 15.1 并行的前提

只有满足以下条件的任务才并行：

- 修改文件集合基本不重叠。
- 接口已经定义。
- 依赖关系明确。
- 每个任务有可独立验证的验收条件。

例如可以并行：

```text
A: Personality package
B: Economy metrics
C: Dashboard charts
D: RNG test suite
```

不应并行：

```text
A: 重写 Person schema
B: 基于旧 Person schema 做婚姻
C: 基于另一版本 Person schema 做职业
```

---

## 15.2 推荐并发规模

> **V2.2 起本节已作废（SUPERSEDED by HT-2）。** 并发策略唯一权威版本是 **HT-2 Concurrency Ladder**：
> Bootstrap 1–4 → 稳定接口 4–8 → 领域扩展 8–16 → Review/Test/Experiment 饱和 16–32（仅环境稳定时）→ 更高仅平台稳定支持时。
> 进入/退出条件以 HT-2 为准，降级信号以 HT-20（Conflict Budget）与 HT-21（Failure Budget）为准。

---

# 16. Git / Branch / Worktree 规则

如果环境支持，所有大型并行任务使用独立分支或 worktree。

命名：

```text
feat/psych-stress-model
feat/economy-job-market
test/deterministic-replay
perf/sim-batch-processing
fix/relationship-state-transition
```

每个 worker 只能修改：

- 自己任务需要的文件。
- 必要的共享接口文件。

修改共享接口前必须：

1. 搜索引用。
2. 检查其他任务是否依赖。
3. 记录 breaking change。
4. 更新相关测试。

禁止：

- 多个 Agent 同时大范围格式化整个仓库。
- 每个 Agent 都修改 lockfile。
- 每个 Agent 都重写 root config。
- 未验证就直接合并大型 diff。

---

# 17. 任务生命周期

每一个 Task 必须遵循：

```text
DISCOVER
↓
PLAN
↓
IMPLEMENT
↓
TEST
↓
SELF REVIEW
↓
PEER REVIEW
↓
FIX
↓
INTEGRATE
↓
DOCUMENT
```

## 17.1 DISCOVER

先回答：

- 已经有类似代码吗？
- 类型在哪里？
- 谁调用它？
- 有哪些测试？
- 与哪些模块耦合？
- 是否有已有 utility 可以复用？

## 17.2 PLAN

写短计划：

```text
Files to read
Files to modify
New types
Tests
Risks
Acceptance criteria
```

不要写 2000 字空洞计划。

## 17.3 IMPLEMENT

小步修改。

## 17.4 TEST

至少运行直接相关测试。

## 17.5 SELF REVIEW

检查 diff。

## 17.6 PEER REVIEW

中大型任务至少安排另一个 Agent review。

## 17.7 FIX

修 Review 中真正的问题。

## 17.8 INTEGRATE

运行更广范围测试。

## 17.9 DOCUMENT

只更新真正受影响的文档。

---

# 18. Definition of Done

任何 Feature 在满足以下条件前，不算 Done：

- [ ] 功能实现。
- [ ] Typecheck 通过。
- [ ] Lint（如启用）通过。
- [ ] 相关单测通过。
- [ ] 相关集成测试通过。
- [ ] 没有明显重复实现。
- [ ] 错误路径被处理。
- [ ] seed / randomness 可测试。
- [ ] 性能敏感代码有 benchmark 或合理分析。
- [ ] public API 有必要文档。
- [ ] 未引入秘密/敏感信息。
- [ ] Review blocker 已解决。

---

# 19. 持续任务队列

建立：

```text
docs/agent/
├── BACKLOG.md
├── ACTIVE.md
├── COMPLETED.md
├── BLOCKED.md
├── NIGHTLY_REPORT.md
└── KNOWN_ISSUES.md
```

## BACKLOG 项格式

```md
## GEN-042 Relationship trust decay

Priority: P1
Domain: relationships
Depends on: GEN-018
Risk: medium
Parallel-safe: yes

Goal:
Implement time-based trust decay for inactive relationships.

Acceptance:
- deterministic under fixed seed/time
- unit tested
- no change for active relationships
- configurable decay parameters
```

---

# 20. 主 Agent 的调度算法

主 Agent 每轮执行：

```text
1. 读取当前 Goal。
2. 读取 ACTIVE / BLOCKED / BACKLOG。
3. 运行必要的 Explore。
4. 找出无依赖的最高价值任务。
5. 将可独立任务并行分配。
6. 等待/收集结果。
7. Reviewer 检查。
8. 合并/集成。
9. 跑测试。
10. 修失败。
11. 更新任务状态。
12. 选择下一批任务。
13. 若 Goal 未满足，继续。
```

优先级：

```text
P0: build / test broken
P1: architecture foundation
P2: end-to-end capabilities
P3: domain depth
P4: UI polish
P5: optional narrative features
```

---

# 21. 防止重复造轮子协议

这是大型多 Agent 项目最重要的规则之一。

在创建任何以下内容前：

```text
service
manager
repository
store
event bus
random utility
date/time utility
Person type
relationship type
metrics framework
test helper
database abstraction
```

必须搜索仓库。

如果发现类似实现：

> 默认扩展已有实现。

只有满足以下情况才允许新增：

- 语义确实不同。
- 现有实现不适合且有具体原因。
- 架构负责人认可拆分。
- 在 DECISIONS.md 记录理由（重要变更）。

---

# 22. 上下文管理

大量 Token 项目不是让每个 Agent 每轮读完整仓库。

采用“渐进上下文”。

## Worker 默认读取

1. `AGENTS.md`
2. 当前任务
3. 相关 package README
4. 相关 interface/type
5. 相关测试
6. 直接调用方

只有需要时再扩大搜索。

## 主 Agent

定期维护：

```text
ARCHITECTURE.md
ROADMAP.md
docs/agent/NIGHTLY_REPORT.md
```

使后续 Agent 可以快速恢复。

如果会话过长：

- 先更新状态文件。
- 再进行上下文压缩。
- 压缩后首先重新读取 Goal 和项目状态。
- 不依赖“我记得之前做了什么”。

---

# 23. 六个 Night Waves

---

## Wave 1：World Foundation

目标：

> 世界能创建、能推进、能重放。

任务池：

- monorepo bootstrap
- shared types
- simulation context
- simulation clock
- seeded RNG
- ID generation
- event bus
- event log
- world state
- entity registry
- person factory
- household
- serialization
- config loader
- CLI
- metrics registry
- tests
- benchmarks

验收：

```text
seed=42
population=10,000
simulate=1 year
```

能重复运行并产生一致关键结果。

---

## Wave 2：Psychology

任务池：

- Big Five
- affect
- stress
- needs
- coping
- self-esteem
- subjective wellbeing
- attachment parameters
- social support
- social comparison
- memory salience
- decision utility
- decay/update functions
- validation tests
- scenario fixtures

验收：

至少能解释：

```text
financial strain
→ stress
→ affect / wellbeing
```

同时不同人格参数产生可测的差异。

---

## Wave 3：Relationships & Family

任务池：

- relationship graph
- interaction events
- acquaintance formation
- friendship
- attraction
- dating
- partnership
- marriage
- conflict
- breakup
- reconciliation
- household formation
- parent-child edges
- birth
- aging
- inheritance hooks

验收：

运行几十年后：

- 存在不同类型关系。
- 关系会变化。
- 家庭会创建/拆分。
- 没有明显非法状态。

---

## Wave 4：Economy & Society

任务池：

- occupations
- skills
- employer
- companies
- labor market
- hiring
- firing
- wages
- consumption
- wealth
- housing
- education
- tax abstraction
- inequality metrics
- economic shocks
- social mobility

验收：

宏观指标由微观行为聚合。

---

## Wave 5：Simulation Lab

建立：

```text
packages/experiments/
```

核心能力：

- experiment config
- treatment/control
- seed sets
- repeated runs
- parameter sweep
- CSV/JSON export
- aggregate statistics
- confidence intervals
- scenario comparison
- report generator

第一批实验：

### EXP-001

```text
Economic shock → stress
```

### EXP-002

```text
Unemployment → relationship conflict
```

### EXP-003

```text
Social support moderates stress
```

### EXP-004

```text
Housing burden → subjective wellbeing
```

### EXP-005

```text
Personality parameters → social network size
```

注意：

这些实验验证的是**Genesis 内部模型行为**，不是直接证明现实世界因果关系。

---

## Wave 6：Red Team / Hardening

执行至少三轮：

```text
RED TEAM
↓
TRIAGE
↓
BLUE TEAM FIX
↓
REVIEW
↓
REGRESSION
↓
BENCHMARK
```

重点攻击：

### Correctness

- impossible ages
- negative money
- duplicate IDs
- invalid relationships
- person married to incompatible state
- dead people acting
- nonexistent employer
- orphan references

### Determinism

- uncontrolled randomness
- iteration ordering
- timestamps
- concurrency
- floating-point instability

### Performance

- O(N²) scans
- repeated graph scans
- excessive allocations
- giant JSON copies
- full population recomputation
- UI rendering 10k objects

### Architecture

- circular dependencies
- god objects
- domain leakage
- duplicated services
- hidden global state

---

# 24. 高 Token 利用率策略

目标不是 Token 少，而是**每一个额外 Token 都尽量产生价值**。

允许扩大计算量的方式：

## 24.1 独立 Review

一个复杂 Feature 可以采用：

```text
Implementer
Reviewer A: correctness
Reviewer B: architecture
Reviewer C: tests
Reviewer D: performance
```

然后由 Implementer 处理有效意见。

---

## 24.2 Property-Based Testing

对于：

- relationships
- money
- state machines
- demographics
- RNG

大量生成随机案例寻找 invariant violation。

---

## 24.3 Fuzz / Scenario Testing

自动创建：

```text
high unemployment
extreme inequality
very old population
high birth rate
economic collapse
mass migration-like synthetic event
```

检查模拟是否崩溃。

---

## 24.4 Monte Carlo Experiments

不要重复完全相同的运行。

应：

```text
不同 seeds
不同 parameters
不同 treatment
```

产生可比较结果。

---

## 24.5 Differential Review

重构前后：

- 相同 seed
- 相同输入
- 比较关键状态
- 明确哪些变化是预期的

---

## 24.6 Performance Iteration

```text
benchmark
→ profile
→ identify hotspot
→ optimize
→ benchmark again
```

没有 profile 证据，不要进行大规模“性能优化”。

---

# 25. 禁止的 Token 浪费行为

严格禁止：

- 同一 Agent 连续重复自己的结论。
- 为每个简单函数写长篇 essay。
- 复制一份模块后只改名字。
- 生成大量没有测试价值的 mock。
- 无理由产生数百个空文件。
- 自动创建成千上万 TODO。
- 重复读取整个仓库而不做筛选。
- 为了“显得复杂”建立不必要微服务。
- 为了增加行数添加注释。
- 对已经通过的内容反复 rewrite。
- 无限 Red Team 循环同一问题。
- 没有变更却重复运行相同 Review。

如果出现空转：

> 主 Agent 必须立刻改变任务类型或进入下一 Wave。

---

# 26. 性能目标

逐步实现，不要一开始为极端规模过度设计。

## P0

```text
1,000 people × 1 year
```

## P1

```text
10,000 people × 1 year
```

## P2

```text
10,000 people × 10 years
```

## P3

```text
10,000 people × 100 years
```

记录：

```text
runtime
peak memory
events generated
events/sec
ticks/sec
```

每次关键优化必须保留 benchmark 结果。

---

# 27. Simulation Invariants

建立全局 invariant test suite。

至少包括：

```text
age >= 0
wealth is finite
all ids unique
all references resolve
dead actors cannot initiate ordinary actions
relationship endpoints exist
household members exist
employment points to existing employer
probabilities stay within valid range
psychological values stay within domain
simulation tick never moves backward
event timestamps are monotonic where required
```

每次完整 CI 都运行。

---

# 28. Observability

每个大型模拟需要：

```text
run id
seed
config hash
commit hash（如可得）
start time
end time
runtime
population
event count
warnings
failed invariants
metrics
```

出现崩溃时生成可复现信息。

禁止只输出：

```text
Simulation failed
```

必须告诉开发者：

- 哪个 run
- 哪个 seed
- 哪个 tick
- 哪个 subsystem
- 关键相关 entity IDs

---

# 29. Dashboard

第一夜 UI 目标不是视觉奢华。

优先：

## Overview

```text
Population
Households
Companies
Employment
Median Income
Mean Wealth
Mean Stress
Mean Wellbeing
Relationships
Marriage rate
Birth rate
Death rate
```

## Person Inspector

```text
identity
personality
psychology
job
wealth
household
relationships
important events
timeline
```

## Simulation Controls

```text
start
pause
step
speed
seed
scenario
reset
export
```

## Charts

```text
population over time
wealth distribution
stress distribution
employment
marriage/divorce
wellbeing
```

---

# 30. 文档规则

必须维护：

## README.md

只包含：

- 这是什么
- 怎么安装
- 怎么运行
- 怎么测试
- 怎么运行模拟

## ARCHITECTURE.md

记录：

- package boundaries
- data flow
- simulation lifecycle
- event flow
- persistence
- key interfaces

## ROADMAP.md

记录：

- Now
- Next
- Later

## DECISIONS.md

只记录重要架构决策。

避免把每个小修改都写成 ADR。

## NIGHTLY_REPORT.md

每一大 Wave 更新：

```text
完成内容
测试状态
benchmark
新风险
blocked items
下一批任务
```

---

# 31. 失败恢复协议

任何 Agent 遇到失败：

## Test failure

1. 读取完整错误。
2. 定位第一个真实失败。
3. 判断新 bug / existing bug。
4. 写最小复现。
5. 修。
6. 重新测试。

## Merge conflict

1. 不暴力覆盖。
2. 理解双方意图。
3. 保留有效功能。
4. 重新 typecheck/test。

## Architecture conflict

暂停相关并行任务。

由 architect：

- 定义 canonical interface。
- 更新文档。
- 再恢复 worker。

## Context lost

重新读取：

```text
AGENTS.md
ROADMAP.md
ARCHITECTURE.md
ACTIVE.md
相关代码
```

禁止凭模糊记忆继续修改。

---

# 32. 主 Agent 不应做什么

主 Agent 不应：

- 独自实现全部功能。
- 每次都读取整个 repo。
- 直接接受所有 Subagent 输出。
- 在测试失败时继续疯狂叠 feature。
- 同时启动一堆修改相同核心文件的 Agent。
- 把 Reviewer 当装饰。
- 让每个 Agent 自由发明 architecture。
- 把“代码量”当成功指标。

主 Agent 的真正职责：

> **调度、约束、验证、整合、持续推进。**

---

# 33. 自动夜间推进原则

当用户不在电脑前时：

如果执行权限允许且不存在必须由用户决定的高风险问题：

- 自动继续下一任务。
- 自动执行常规测试。
- 自动修复失败。
- 自动进行 Review。
- 自动更新任务状态。
- 自动启动下一个无阻塞工作包。

遇到以下情况应停下相关路径，但继续其他安全任务：

- 需要密钥。
- 需要付费服务。
- 需要真实个人数据。
- 需要不可逆外部操作。
- 需要用户选择互斥产品方向。
- 即将进行危险系统级操作。

不要因为一个任务阻塞而让整个项目停止。

---

# 34. 第一批 Backlog

初始化项目后，创建以下任务。

## Foundation

- GEN-001 Bootstrap monorepo
- GEN-002 Shared configuration
- GEN-003 Seeded RNG
- GEN-004 Simulation clock
- GEN-005 Simulation context
- GEN-006 Event bus
- GEN-007 Event log
- GEN-008 Entity IDs
- GEN-009 World state
- GEN-010 Simulation CLI
- GEN-011 Deterministic replay test
- GEN-012 Metrics registry

## Person

- GEN-020 Person entity
- GEN-021 Person lifecycle
- GEN-022 Person factory
- GEN-023 Life stage
- GEN-024 Population generator
- GEN-025 Mortality abstraction

## Psychology

- GEN-030 Big Five
- GEN-031 Affect
- GEN-032 Needs
- GEN-033 Stress
- GEN-034 Coping resources
- GEN-035 Self-esteem
- GEN-036 Wellbeing
- GEN-037 Attachment parameters
- GEN-038 Social support
- GEN-039 Memory salience

## Social

- GEN-050 Relationship graph
- GEN-051 Relationship metrics
- GEN-052 Interaction engine
- GEN-053 Friendship formation
- GEN-054 Attraction
- GEN-055 Partnership
- GEN-056 Marriage
- GEN-057 Breakup
- GEN-058 Conflict
- GEN-059 Relationship history

## Family

- GEN-070 Household
- GEN-071 Household formation
- GEN-072 Parenthood
- GEN-073 Birth
- GEN-074 Family links
- GEN-075 Inheritance hooks

## Economy

- GEN-090 Occupation
- GEN-091 Employer
- GEN-092 Company
- GEN-093 Salary
- GEN-094 Job market
- GEN-095 Hiring
- GEN-096 Unemployment
- GEN-097 Consumption
- GEN-098 Wealth
- GEN-099 Economy metrics

## Platform

- GEN-110 API
- GEN-111 Simulation controller
- GEN-112 Dashboard shell
- GEN-113 Overview metrics
- GEN-114 Person inspector
- GEN-115 Timeline view
- GEN-116 Simulation controls
- GEN-117 Export

## Quality

- GEN-130 Unit test framework
- GEN-131 Integration tests
- GEN-132 Invariant suite
- GEN-133 Property tests
- GEN-134 Benchmark harness
- GEN-135 Observability
- GEN-136 Error reporting
- GEN-137 Red-team pass

## Experiments

- GEN-150 Experiment config
- GEN-151 Multi-seed runner
- GEN-152 Parameter sweep
- GEN-153 Aggregation
- GEN-154 Export
- GEN-155 Report generator
- GEN-156 Economic shock experiment
- GEN-157 Social support experiment

主 Agent 可以继续拆分，但不得一次生成成千上万毫无上下文的任务。

---

# 35. 第一夜自动循环

> **V2.2 起本节已作废（SUPERSEDED by HT-5 / HT-28）。** 夜间循环的唯一权威版本是 **HT-5 Batch Scheduler** 与 **HT-28 HIGH-THROUGHPUT MODE**（每批任务数、批内顺序、build 红时的处理、Wave 推进条件均以那里为准）。

---

# 36. 推荐 ZCode 会话策略

## 主会话

只做：

- Goal
- orchestration
- architecture
- integration
- status

## Subagents

做：

- implementation
- research
- tests
- review
- experiments

## Side conversations（如果使用）

适合：

- 临时询问
- 快速解释错误
- 小型调查

不要把关键项目状态只留在临时会话。

---

# 37. `/goal` 建议

> **V2.2 起本节已作废（SUPERSEDED by HT-30）。** 今晚唯一使用的 Goal 是 **HT-30 亿级 Token Goal V2**（Appendix D 启动顺序第 7 步指向同一版本）。不要使用本节旧版 Goal。
> 若单晚预算不足以支撑完整 Goal，正确做法是调低该 Goal 的 Usage Budget 让它分批推进，而不是换用一个更小的目标文本。

---

# 38. MAIN AGENT MASTER PROMPT

> **V2.2 起本 Master Prompt 已整体删除（SUPERSEDED by HT-31）。** 今晚唯一使用的 Master Prompt 是 **HT-31 MASTER PROMPT V2**；附录 G（启动 Prompt 最终推荐版）是其等价复制版。

---

## MASTER PROMPT BEGIN（V1，已整体删除）

> **V2.2 起本 Master Prompt 已删除（SUPERSEDED by HT-31）。**
> 今晚唯一使用的 Master Prompt 是 **HT-31 MASTER PROMPT V2**；附录 G（启动 Prompt 最终推荐版）是其等价复制版。
> 需要旧版内容时请查阅 V2.1 历史版本。

## MASTER PROMPT END（V1，已整体删除）

---

# 39. 第二条启动消息（推荐）

在 Master Prompt 之后，可发送：

```text
请进入长程执行模式。先建立可验证的项目状态，然后立即推进 Wave 1。不要一次性生成大而空泛的计划；把工作拆成可以独立验证的任务。能并行的任务使用 Subagents 并行执行，不能并行的核心接口先串行稳定。每批合并后运行测试和 deterministic checks。如果 Wave 1 达标，自动进入 Wave 2，不需要等我回复。
```

随后设置 `/goal`。

---

# 40. 如果希望更猛烈地利用夜间免费窗口

在工程稳定后，可以发送：

```text
在不牺牲代码质量、测试完整性和仓库一致性的前提下，提高并行度。优先将互不修改相同核心文件的实现、测试、Review、性能分析和实验任务并行化。不要制造无意义工作；如果某个领域暂无可执行任务，就从 Backlog 中选择下一项有明确验收标准的任务。每轮都要产生代码、测试、可复现实验结果、性能改进或有证据的 Review 结论。
```

**不要**简单发送：

```text
尽量多烧 Token
```

因为这会降低 Agent 的目标质量。

应该让高消耗自然来自：

> **并行真实工作 + 深度 Review + 自动测试 + 大量可复现实验。**

---

# 41. 早上验收清单

第二天先不要看代码行数。

检查：

```bash
git status
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

然后运行：

```text
small deterministic simulation
10k simulation
benchmark
experiment smoke test
```

再看：

- NIGHTLY_REPORT
- BLOCKED
- KNOWN_ISSUES
- benchmark
- test count
- git history/diff
- Dashboard

重点问题：

1. 项目真的能跑吗？
2. 测试真的在测机制吗？
3. seed 能重放吗？
4. 是否出现大量重复抽象？
5. 是否存在巨型 God Object？
6. 模拟结果是否会数值爆炸？
7. 性能瓶颈在哪里？
8. 有没有“看起来做了很多，实际上没贯通”的模块？
9. Dashboard 是否能看到真实 simulation state？
10. 是否至少存在一个端到端 experiment？

---

# 42. 最终衡量标准

Project Genesis 第一夜不以以下指标判断成功：

- Token 消耗
- 代码行数
- 文件数量
- Agent 数量

真正指标是：

```text
可运行
可测试
可复现
可扩展
可观测
可实验
可持续迭代
```

如果最终真的消耗了数亿 Token，而项目同时满足这些标准，那么这些 Token 才真正变成了一个大型 Vibe Coding 项目，而不是一次昂贵的文本生成实验。

---

# Appendix A：建议的 AGENTS.md 精简版

如果不希望把整份指南作为每个 Agent 的上下文，可以将下面内容单独保存为项目根目录 `AGENTS.md`：

```md
# Project Genesis Agent Rules

Project Genesis is a large AI virtual-society simulation platform.

## Model
Use GLM-5.3-Flash for the primary agent and all configurable subagents. Do not switch to another paid model without explicit user authorization.

## Core behavior
- Continue through the backlog while the active goal is incomplete and safe unblocked work remains.
- Never generate useless code or text just to consume tokens.
- Search the repository before creating a new abstraction.
- Extend canonical implementations instead of creating parallel versions.
- Keep simulation core independent from UI.
- All randomness must use the seeded RNG.
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
- modular packages
- explicit interfaces
- dependency direction
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
- docs/agent/NIGHTLY_REPORT.md

## Priority
P0 broken build/tests
P1 foundations
P2 end-to-end capabilities
P3 domain depth
P4 UI polish
P5 optional narrative features
```

---

# Appendix B：推荐第一条 `/goal`（已作废）

> **V2.2 起本附录已作废（SUPERSEDED by HT-30）。** 今晚唯一使用的 Goal 见 **HT-30 亿级 Token Goal V2**。以下旧文本仅作历史保留，禁止使用。

```text
/goal 持续推进 Project Genesis，直到项目能够以固定 seed 创建至少 10,000 名居民、稳定模拟至少 10 年，具备心理、人际关系、家庭和基础经济系统，拥有可用 Dashboard、自动化测试、deterministic replay、全局 invariant 检查与 benchmark；所有新增核心功能都必须通过 Review 和相关测试。在 Goal 完成前，只要仍存在安全且无阻塞的 backlog 工作，就继续实施、验证、修复和集成，不要仅因基础版本可运行而提前结束。
```

---

# Appendix C：夜间结束报告格式

```md
# Nightly Report

## Summary
- Start commit:
- End commit:
- Total major tasks completed:
- Current wave:
- Build:
- Typecheck:
- Tests:
- Benchmark:

## Completed
...

## End-to-end capabilities
...

## Simulation scale
- population:
- simulated years:
- runtime:
- peak memory:
- seed:

## Tests
- unit:
- integration:
- property:
- invariant:
- deterministic replay:

## Major architecture changes
...

## Red-team findings
...

## Fixed
...

## Remaining risks
...

## Blocked
...

## Recommended next wave
...
```


---

# Appendix D：今晚的亿级运行启动顺序

```text
1. 新建或打开 Project Genesis
2. 将精简稳定规则保存为根目录 AGENTS.md
3. 将本手册保留在项目根目录
4. 主 Agent 选择 GLM-5.3-Flash
5. Subagents 使用 inherit / GLM-5.3-Flash
6. 发送 MASTER PROMPT V2
7. 设置“亿级 Token Goal V2”
8. 前 2–3 个 Batch 只观察稳定性
9. build/test/determinism 持续绿色后逐级提高并发
10. 进入 Tier 3 后，让 Builder + Tester + Reviewer + Scientist 并行
11. 保持 Ready Queue ≥ 40
12. 夜间持续 Batch → Integration → Verification → Next Batch
13. 早上先做独立质量审计
```

为了尽可能接近 **1 亿 Token**：

- 不要在 Bootstrap 阶段过早开满并发。
- 真正高吞吐期放在接口稳定以后。
- 额外并发优先给测试、Review、实验与性能调查，而不是全给 Builder。
- 保持 Ready Queue 深度，防止无任务可派。
- Main 不要等待单个长任务而空转。
- 将 property testing、multi-seed analysis、cross-module review 变成持续流水线。
- 冲突率或返工率明显上升时主动降并发。
- 以 ZCode 实际 Usage 为最终 Token 消耗依据，不伪造统计。

**这份手册能保证的是：提供足够大的真实工程工作池和高吞吐调度方式；不能保证平台本身一定允许单晚通过 1 亿 Token。**


---

# Appendix E：ZCode 夜间运行前置检查（官方机制核对版）

这一部分属于**实际开跑前必须检查的运行条件**。如果这里没配置好，再好的 Agent 调度也可能半夜停住。

## E-1. Goal Usage Budget 是硬闸门

ZCode Goal Mode 会自动跨轮推进，但一个 Goal 会在以下情况停止：

```text
1. Goal verification 判断完成
2. 用户 pause / clear
3. 达到该 Goal 配置的 usage budget
```

因此，如果今晚目标是超长运行：

> **创建 `/goal` 后，检查该 Goal 的 Usage Budget，并设置到你愿意允许的最高合理范围。**

如果 Usage Budget 很小，Main Prompt 无法绕过它，也不应该尝试绕过。

不要把“Goal 写得特别大”误认为“可以无限运行”。

---

## E-2. Execution Mode 决定半夜会不会卡在确认

ZCode 的执行模式可能包括类似：

```text
Ask before changes
Edit automatically
Plan
Full access
```

对于用户本人已经明确授权、且项目是新建的实验性本地仓库：

```text
推荐：Full access
```

原因：

- 文件修改不需要频繁等待确认。
- 普通开发命令更容易连续执行。
- 更适合 Goal Mode 的多轮自动推进。

如果不愿开放完整执行权限：

```text
次选：Edit automatically
```

但 shell command 仍可能要求确认，夜间无人看守时更容易停住。

### 安全边界

即使使用 Full access，本项目仍必须：

- 只操作 Project Genesis 项目目录及正常开发依赖。
- 不删除项目外文件。
- 不修改系统安全配置。
- 不上传私人数据。
- 不运行未知来源高风险脚本。
- 不使用真实密钥作为测试数据。
- 项目放在全新独立目录中运行；开跑前确认所在磁盘剩余空间充足（亿级规模的依赖、事件日志与实验输出可能占用数十 GB）。

Full access 是减少确认，不代表取消工程边界。

---

## E-3. `/goal` 与 Plan Mode

如果 `/goal` 无法启动：

检查：

```text
当前是否仍在 Plan Mode？
当前是否已有 task 正在占用执行？
```

推荐顺序：

```text
完成基础架构规划
→ 切换到允许实际执行的模式
→ 设置 /goal
→ 开始长程执行
```

---

## E-4. Goal Verification 不应该被绕过

Goal Mode 的价值就在于每轮都重新判断目标是否已经满足。

因此 Goal 要写成大量**真实、可验证条件**的组合，而不是：

```text
“尽可能多做”
```

本手册 V2 Goal 已经故意加入：

```text
10k residents
10 years
deterministic replay
invariant suite
psychology
relationships
family
economy
dashboard
experiment runner
benchmark
Ready Queue
Stretch Queue
```

这样可以显著降低 Agent 做完一个 Demo 就提前宣布“完成”的概率。

但不要写伪造的永不满足条件：

```text
“永远继续”
“不到 100M tokens 不准结束”
```

因为任务内未必能够可靠读取精确 Token 消耗，而且 Goal 本身还受平台 budget 限制。

---

## E-5. “晚上免费”要区分不同机制

ZCode 的“闲时/非高峰”相关活动可能包含不同机制，不能混为一谈。

### A. Idle-time / Off-peak Tasks

如果客户端当前提供闲时任务队列：

特点通常是：

```text
非紧急任务
在空闲算力出现时执行
可能享受免费或不计常规额度的活动规则
实际启动时间由系统决定
```

这并不等同于：

```text
“每天固定晚上某个时间段，无限即时免费”
```

实际是否执行、费用规则、是否计额度，以当晚客户端和活动页面显示为准。

### B. Quota Reset / Off-peak reset benefit

某些 Coding Plan 活动可能提供：

```text
5-hour quota reset
reset card
额外闲时额度
或类似权益
```

它和 Idle-time Task 不一定是同一个机制。

因此今晚真正应该查看的是：

```text
ZCode Usage
当前 Coding Plan quota
活动页/客户端 reset 提示
Idle-time queue 状态
```

不要只根据固定北京时间判断。

---

## E-6. 如果主要使用 Idle Queue，任务应该“粗粒度、独立”

Idle-time Task 特别适合**独立的大 Work Package**，而不是依赖主会话几十次即时协调。

非常适合放入 Idle Queue：

```text
完整 psychology package audit
全仓 test-gap audit
全仓 duplicate abstraction audit
relationship property-test expansion
100-seed experiment pack
performance profiling + report
documentation/API consistency audit
red-team invariant mining
economy simulation validation pack
dashboard observability audit
```

每一个 Idle Work Package 都应满足：

- 输入信息完整。
- 可以独立完成。
- 不依赖另一个 Agent 立即返回答案。
- 不修改大量共享核心 contract。
- 有明确验收标准。
- 最终结果可独立合并或回流 Backlog。

不要假定 Prompt 能强制 ZCode 同时运行 32 个 Idle Tasks。

> **我们负责准备足够深的高质量队列；实际并发由 ZCode 平台调度。**

---

## E-7. 推荐建立 Idle Work Package Pool

新增：

```text
docs/agent/IDLE_QUEUE.md
```

保持至少：

```text
20–60 个可独立执行的大型 Work Packages
```

示例：

```md
## IDLE-PSY-001 Psychology invariant audit

Domain: psychology
Risk: low
Shared contract edits: no
Expected scope: packages/psychology + tests
Parallel-safe: yes

Goal:
Audit all psychology update functions for invalid ranges,
NaN propagation, missing clamps, nondeterministic randomness,
and inconsistent units.

Deliverables:
- findings report
- regression tests
- minimal fixes for confirmed bugs
- no unrelated refactor

Acceptance:
- all psychology values finite
- all configured bounds enforced
- fixed-seed test deterministic
- full psychology test suite green
```

这种任务非常适合闲时执行，因为即使主 Agent 没在旁边，它也能完整闭环。

---

## E-8. 亿级 Token 的关键不是一个 Goal，而是“三层工作池”

推荐同时维护：

```text
LEVEL 1 — ACTIVE BATCH
当前 4–32 个正在做的任务

LEVEL 2 — READY QUEUE
40–120 个已经定义、可立即派发的任务

LEVEL 3 — IDLE / DEEP WORK POOL
20–60 个超大、独立、适合后台或闲时运行的任务
```

三层的作用：

```text
ACTIVE      = 保持即时吞吐
READY       = 防止 Main 缺任务
IDLE POOL   = 吸收大块免费/闲时算力
```

再加：

```text
IDEA QUEUE = 100–300 个未来候选
```

这样项目即使连续跑很多小时，也不会快速“没活干”。

---

# Appendix F：50 个高价值 Idle / Deep Work Packages

以下任务不是要求全部第一晚完成，而是为亿级工作量提供真实储备。

## Psychology

```text
IDLE-001 Psychology full invariant audit
IDLE-002 Psychology parameter-bound audit
IDLE-003 Stress model property-test expansion
IDLE-004 Affect dynamics multi-seed validation
IDLE-005 Coping model adversarial scenarios
IDLE-006 Attachment/relationship contract review
IDLE-007 Wellbeing cross-domain dependency audit
IDLE-008 Memory salience regression suite
IDLE-009 Personality generator distribution audit
IDLE-010 Psychology documentation vs implementation audit
```

## Relationships / Family

```text
IDLE-011 Relationship state-machine exhaustive audit
IDLE-012 Relationship graph property tests
IDLE-013 Marriage/breakup invalid-state fuzzing
IDLE-014 Household-reference integrity audit
IDLE-015 Parent-child lifecycle consistency audit
IDLE-016 Relationship decay parameter sweep
IDLE-017 Social-support network validation
IDLE-018 Long-horizon family simulation analysis
```

## Economy

```text
IDLE-019 Economy finite-value invariant audit
IDLE-020 Wealth conservation/accounting audit
IDLE-021 Job-market matching benchmark
IDLE-022 Wage distribution parameter sweep
IDLE-023 Company lifecycle fuzzing
IDLE-024 Unemployment scenario pack
IDLE-025 Housing affordability experiment pack
IDLE-026 Economic shock regression suite
IDLE-027 Cross-domain economy↔stress contract audit
```

## Core / Determinism

```text
IDLE-028 Repository-wide Math.random audit
IDLE-029 Deterministic replay cross-platform audit
IDLE-030 Event ordering audit
IDLE-031 Entity-reference integrity audit
IDLE-032 Serialization round-trip fuzz tests
IDLE-033 Seed reproduction failure miner
IDLE-034 Long-run numerical stability audit
IDLE-035 Simulation clock boundary audit
```

## Performance

```text
IDLE-036 1k→10k scaling benchmark
IDLE-037 10k×10y hotspot profile
IDLE-038 Allocation/memory-pressure audit
IDLE-039 Relationship graph complexity audit
IDLE-040 Metrics aggregation performance audit
IDLE-041 Event-log memory optimization study
IDLE-042 Dashboard large-state rendering audit
```

## Experiments

```text
IDLE-043 30-seed stress experiment pack
IDLE-044 30-seed unemployment/wellbeing experiment
IDLE-045 30-seed social-support moderation experiment
IDLE-046 Network homophily parameter sweep
IDLE-047 Wealth-buffer × job-loss experiment
IDLE-048 Population aging long-horizon experiment
```

## Repository Quality

```text
IDLE-049 Duplicate abstraction repository audit
IDLE-050 Full test-gap and weak-assertion audit
```

完成这些之后，Main 可以继续基于发现生成新的 Deep Work Packages。

---

# Appendix G：高吞吐启动 Prompt（最终推荐版）

如果今晚只想复制一段给主 Agent，用这一版。

```text
进入 Project Genesis High-Throughput Night Mode。

你是唯一顶层 Director / Scheduler / Integration Owner。主模型和所有可配置 Subagents 均保持 GLM-5.3-Flash，不得擅自切换其他收费模型。

第一目标不是生成最多代码，而是在 main 可恢复、build/test 持续可控、随机行为可复现的前提下，持续维持真实工程吞吐。

立即完成以下初始化：
1. 读取 AGENTS.md、ARCHITECTURE.md、ROADMAP.md。
2. 检查 Git/build/typecheck/test。
3. 建立或更新 ACTIVE、BLOCKED、BACKLOG、THROUGHPUT、MERGE_QUEUE、IDLE_QUEUE。
4. 维持 40–120 个带 Acceptance 的 Ready Work Packages。
5. 维持 20–60 个粗粒度、独立、适合后台/闲时执行的 Deep Work Packages。
6. Bootstrap 时并发 1–4；接口稳定后升到 4–8、8–16；只有连续集成稳定时才进入 16–32 或平台可支持的更高安全并发。
7. 额外并发不要全部给 Builder，应同时运行 Tester、Reviewer、Scientist、Performance 和 Red Team。
8. 一个 Batch 结束必须执行 typecheck、相关测试、invariant、deterministic smoke，并更新吞吐状态。
9. Build 红、Determinism 红、Invariant 红时，暂停相关新 feature，优先恢复。
10. Main 不要空等单个 Subagent；等待期间继续 refine backlog、集成已完成工作、派发只读 audit、运行实验或准备下一 Batch。

默认任务比例：
50% implementation/refactor
20% tests
15% independent review
10% experiment/validation
5% performance/docs

最低产品目标：
- 10,000 residents
- ≥10 simulated years
- seeded RNG
- deterministic replay
- psychology integration
- relationships
- family/household
- job/income/wealth
- real-state dashboard
- experiment runner
- invariant suite
- benchmark
- nightly report

最低目标完成后不要因为 Demo 已能运行就结束。继续从 validation、property tests、multi-seed experiments、performance、education、housing、labor、social network、institutions、Red Team、architecture debt 和 observability gaps 中产生新的有验收标准任务。

禁止：
- 重复造轮子
- 平行 Person/RNG/EventBus
- 空文件
- 无效测试
- 同一 Review 无限重复
- 为消耗 Token 复制代码或重复输出
- 无证据大规模重构

只有用户停止、平台/活动额度阻止继续、剩余工作全部涉及高风险/敏感/付费操作，或真正不存在安全有价值工作时，才停止整个 Goal。

现在立即执行，不要只输出计划。
```

---

# Appendix H：最终 1 亿 Token 可行性判断

如果今晚你想判断“有没有机会实际冲到 1 亿”，看这四个条件：

```text
1. 平台给你的实际免费/闲时总额度是否足够
2. 实际模型吞吐和并发是否足够
3. Goal/Task 的 usage budget 是否足够
4. ZCode 是否能持续保持多个独立 Agent 有工作
```

项目侧，本手册已经提供：

```text
700–1,400 个潜在 Work Packages
40–120 Ready Queue
20–60 Deep/Idle Queue
持续 Task Factory
持续 Experiment Factory
持续 Review/Test/Red-Team 回路
```

因此：

> **项目本身不会成为 1 亿 Token 的主要瓶颈。**

更可能成为瓶颈的是平台额度、模型吞吐、并发限制和夜间活动规则。

如果最终只消耗了例如 2,000 万、5,000 万 Token，也不应让 Agent为了“补数字”制造垃圾工作；应该把它理解为当晚平台所能提供的真实吞吐上限之一。

