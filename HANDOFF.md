# Project Genesis — 会话交接文件（HANDOFF）

> **写于 2026-09-13，交接自运行约 40 小时（三夜 + 两个白天）的工作会话。**
> **本文件是新会话的唯一起点。读完即可无缝接续，无需旧会话上下文。**

---

## 0. 一句话现状

**Project Genesis 是一个 1 万人规模、TypeScript 严格模式的虚拟社会模拟平台，位于
`C:\Users\13100\.zcode\workspace\project-genesis`（真实存储 D 盘）。
当前 54 个 commit、252/252 测试绿、typecheck 0 错误、11 个包。
运营手册 V2.2 = `PROJECT_GENESIS_GUIDE.md`（权威章节 HT-2/HT-5/HT-22/HT-28/HT-30/HT-31；
标 SUPERSEDED 的 V1 章节一律不用）。项目根 `AGENTS.md` 已有精简规则。**

---

## 1. 如何查看工作成果（按易用程度排序）

| 想看什么 | 怎么看 |
|---|---|
| **可视化世界（强烈推荐先看这个）** | `cd C:\Users\13100\.zcode\workspace\project-genesis && npm run api` → 浏览器开 http://localhost:3001 → 点 start。看到：实时控制台（start/pause/step/speed/export）、Overview 卡片、压力/幸福感/人口三条趋势线、Person Inspector（输入 person-000001）、事件流 |
| 实验报告 | `out\experiments\EXP-001.md`、`EXP-002.md`、`EXP-003.md`、`EXP-004.md`、`EXP-006.md`、`EXP-021.md`、`EXP-022.md`、`EXP-025.md`、`EXP-029.md`、`EXP-030.md`（Markdown 直接读，含方向裁决表） |
| 最新 10k×10y 数据 | `out\run-42-*.json`（manifest：seed/configHash/digest/全指标） |
| 基准测试 | `benchmarks\RESULTS.md`（最新：10k×1y=18.7s，10k×10y=5.6min，6 新域仅 +8% 成本） |
| 完整夜报 | `docs\agent\NIGHTLY_REPORT.md` |
| 看门狗值守日志 | `docs\agent\WATCHDOG.md`（每小时心跳 + 8 次接管记录） |
| 已知问题与红队处置 | `docs\agent\KNOWN_ISSUES.md`（KI-1~9 全 FIXED + 五轮红队 45+ 项 disposition） |
| 待办 | `docs\agent\BACKLOG.md`（每个任务带验收标准） |
| 架构 | `ARCHITECTURE.md`（包边界/时间模型/RNG/调度） |

## 2. 常用命令

```bash
cd C:\Users\13100\.zcode\workspace\project-genesis
npm install          # 依赖（幂等）
npm test             # 252 个测试（56 文件）——应全绿
npm run typecheck    # 严格 TS——应 0 错误
npm run sim -- --seed 42 --population 10000 --years 10   # 10k×10y ≈ 5.6 分钟
npm run exp -- --id EXP-002                              # 跑任意预设实验
npm run api          # Dashboard + HTTP API（端口 3001）
npm run bench        # 基准（1k×1y 与 10k×1y）
npx vitest run packages/economy   # 单包测试（把 economy 换成任意包名）
```

### 端口与后台
- `npm run api` 占 3001 端口；旧会话的后台进程随会话结束已停，重跑即可。
- 长跑（10k×10y ≈ 5.6 分钟）建议 `--out out` 留 manifest。

## 3. 架构速览（依赖方向：上→下）

```
apps/simulation-cli  apps/api（Dashboard+HTTP）
        │
experiments · psychology · economy · social · family · education · housing · institutions · media   （域包）
        │
packages/simulation（引擎、Person schema、kinship、invariants）
        │
packages/core（rng/clock/ids/events/scheduler/metrics）
        │
packages/shared（整数美分货币、stable 序列化）
```

- **时间**：tick=小时，8640 tick/年（简化历法：24h 天/30 天月/12 月年）。
- **随机**：一切经 `createRng(seed)` + `fork(label)`；`Math.random`/`Date.now` 在核心层禁用（invariant 审计）。
- **货币**：整数美分，经 `@genesis/shared` helpers。
- **旁表**：education/housing/institutions/media 用 `ctx.extensions` Map（不进 canonical schema、不进 digest——DECISIONS.md 有记录）。
- **调度**：事件驱动 min-heap（系统按 nextFireTick 注册，priority 排序）；系统清单见 `apps/simulation-cli/src/profile.ts` 的 `fullStackSystems()`（**单次使用**——RT2-10）。

## 4. 三条已验证的系统链路（都有配对世界实验）

1. **政策链**：incomeTaxRate → monthlyTaxation → 税池（extensions）→ monthlyWelfare/monthlyPension（池优先、缺口赤字审计）→ financialStrain 软化 → 压力 ↓（EXP-030: 0.463 vs 0.498；EXP-025: 0.470 vs 0.495）
2. **信息链**：extraversionBias → 社交图密度 → 媒体听闻概率（degree-scaled）→ 信念转化/周衰减（EXP-021: +14% 听众；EXP-006: +46% 边）
3. **家庭/亲缘深链**：亲缘 v2（血亲二度+姻亲一度禁婚）→ 婚姻（好友驱动+affinity）→ 离婚（conflict 驱动+子女抚养）→ 继承（spouseAtDeathId 快照、配偶 50%+子女均分）→ 空户 GC

**方法论要点（新会话必须知道）**：实验两臂是**配对世界**（numericSeed 只派生自 seed，
RT4-04 根修）——同 seed 两臂只有处理不同，没有世界间方差。改 config 字段不会重掷世界。
全部 10 个实验预设的 STATUS 注释记录了各自的演化史（含 3 次"负结果→诊断→修复→确认"循环）。

## 5. 质量体系现状

- **红队五轮审计**（read-only subagent）：约 60 项发现，**全部处置完毕**（逐项 disposition 见 KNOWN_ISSUES.md 尾部——RT5 段是 2026-09-13 补录的）。第五轮 PASS WITH ISSUES；全部 MEDIUM（RT5-01/02/03/04/05/06）已修，RT5-07（deadSpouseOf 多配偶 + 守卫反转）已修，仅剩 RT5-08/09 的 LOW 残渣记录在案。
- **看门狗自动化**：ZCode Cron 每小时整点，ID `automation-337f368b-7d51-4718-b6ab-e832db2c9460`（标题"Genesis 夜间看门狗"）——读 THROUGHPUT.md/git 时间戳，停滞 ≥40 分钟则 typecheck+test 判色，绿色即从 BACKLOG 串行接管一个任务（已执行 10+ 次接管，全部闭环）。
  - **新会话主动工作时**：你自己的会话就是"活动"，看门狗只会记心跳不会干扰；但若你派发长 Subagent 任务超过 40 分钟无 git/THROUGHPUT 变动，它可能并发接管——把大任务拆成有中间提交的阶段即可。
  - **要暂停/删除**：用 CronList 找到 ID 后 CronDelete；或 CronUpdate 改为低频。
- **变异测试文化**：每个新机制都配"实现破坏则测试必红"的回归测试。

## 6. 当前 BACKLOG（新会话从这里继续）

按价值排序（完整列表见 docs/agent/BACKLOG.md）：

1. **KI-2 调度重构**（大工程，建议主会话决策）：日度系统仍全量扫描人口；10k×100y（P3 目标）需要事件驱动 per-person 调度或分区批处理。先跑 profile 再动手（HT-24.6）。
2. **媒体信念 v3 扩展**：信念转化目前是平坦 0.6——接入来源信任（传闻 vs 官方报纸）、社交强化（邻居相信→更容易信）。
3. **住房/机构深度**：质量维护已通，renovations/资金循环未做；学校质量→技能已接，师生比/资金未做。
4. **RT5 LOW 残渣**：RT5-08（pension personsById 死变量、paidThisRun void、heardBy 不可达判重、media.ts v1 陈旧头注释）、RT5-09（institutions `||true` 恒真、media 构造恒真、fullstack `person.died>=0`）——半小时级清扫批次。
5. **Dashboard 增强**：institutions/media 侧表状态尚未入 UI（API 档案已暴露，UI 未跟）。
6. **HT-32 审计第 6 轮**：距红队五轮已 7+ 批次。
7. **文档卫生**：NIGHTLY_REPORT 的批次附录顺序错乱（7 在 6 前）已加说明但未重排；BACKLOG 的 Wave-1 条目已补 DONE 标记（2026-09-13）。

## 7. 已知坑（新会话直接避开）

- **并行 Subagent 同时 `npm install`** 会撞 lockfile——Director 先链接再派发（KI-5）。
- **configHash 对 undefined 敏感**：可选旋钮显式传 undefined 必须在 normalizeConfig 剥离（名单在 config.ts；新增可选旋钮记得加进去——RT5-04 教训）。
- **事件日志 recent 窗口只有 1000 条**：测试断言用聚合计数器/metrics，不要过滤 recentEvents 找早期事件。
- **pool-first 会计**：福利/养老金都是"池优先、缺口赤字"，测试要断言 deficit < total（RT5-01 教训）。
- **实验方向测试**：先实测效应量再定断言；微小效应（<0.01）用 bounded non-inverse 而非强方向（EXP-001 教训）。
- **测试新 fixture**：手造 Person 必须带全部 schema 字段（partnerId/maritalStatus/spouseAtDeathId/motherId/fatherId），否则 invariant 会抓。
- **教育 mean_skill 是 gauge**（statsOf 读不到）——用 gaugeValue（RT4-06 教训）。
- **手造 Person 字面量**：每次 schema 加字段，全仓测试 helper 的 Person 字面量都要同步（TS 会抓，但别用 require 动态导入绕过类型检查——会漏）。
- **kinship deadSpouseOf 类守卫**：写"跳过活人"的过滤时小心别把"只存在于死者身上的数据"一起跳掉（RT5-07 守卫反转教训：反向表空转了一夜才被审计发现）。
- **新可选 config 旋钮**：三处同步——config 接口+校验、normalizeConfig 剥离名单、（如适用）experiment PRIMARY_METRIC。

## 8. 给新会话的第一条消息建议

```
读取 C:\Users\13100\.zcode\workspace\project-genesis\HANDOFF.md，
按其第 6 节 BACKLOG 顺序继续推进 Project Genesis。
遵守项目 AGENTS.md 与 PROJECT_GENESIS_GUIDE.md V2.2（HT 层权威）。
每个批次：实现→测试→typecheck→提交→更新 docs/agent/ 状态文件。
保持 main 绿色；不用等我确认，除非遇到需要产品决策的分叉。
```

---
*交接完成。总计：53 commit（至 fd0057a）、252/252 测试、11 包、10 实验预设、五轮红队、~40 小时连续工程。*
