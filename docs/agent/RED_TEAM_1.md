# RED TEAM 审计报告 · 第一轮（guide §23 Wave 6 / HT-32）

- 审计员：Red Team #1（独立工程审计）
- 日期：2026-09-08
- 审计对象：`@genesis/shared` / `core` / `simulation` / `economy` / `psychology` / `apps/simulation-cli` / `benchmarks`（深查）；`@genesis/social` / `@genesis/family`（仅 grep 级扫描，并行开发中）
- 约束：只读审计；已知问题 KI-1（社交边无界增长）、KI-2（日度全量扫描）、KI-3（死者社交边冻结）不重复报告，仅在相关处补充深度。

---

## 发现清单

### RT1-01 [HIGH] 出生资格不校验伴侣关系，且 Person 无父代字段：非配偶可生育、亲缘不可追溯

- 文件：`packages/simulation/src/demography.ts:18-31`；`packages/simulation/src/population.ts:58-72`；`packages/simulation/src/types.ts:50-65`；`packages/simulation/src/factory.ts:74`
- 证据：

```ts
// demography.ts:20-27 — 唯一的资格判定
const members = household.memberIds.map((id) => personById.get(id)).filter((p): p is Person => p !== undefined && p.alive)
if (members.length !== 2) continue
const male = members.find((p) => p.sex === 'male')
const female = members.find((p) => p.sex === 'female')
if (male === undefined || female === undefined) continue
const ageF = ageYears(female.birthTick, ctx.tick())
if (ageF < 18 || ageF > 45) continue
```

  完全没有检查 `partnerId`/`maritalStatus`。而 `population.ts:68-72` 会把未成年人随机塞进任一"成人家庭"（含单人家庭）。于是：生成期被分到某单身成年人家的 random 女童，年满 18 后该户即满足"2 名存活成员、一男一女、女 18-45"，开始按 `birthProbabilityPerMonth` 产子——两人 `maritalStatus='single'`、`partnerId=null`。同户 non-kin 未成年人（兄弟姐妹关系在数据上根本不存在）成年后同理。
  另外 `types.ts` 的 `Person` 没有任何 parent 字段，`factory.ts:74` 的 `person.born` 事件 `actorIds=[newborn.id]`，连出生家庭都不记录——事后审计"谁生的"在数据上不可能。
- 失败模式：非配偶生育、隐性乱伦（无亲缘数据）、出生不可溯源；Wave 3 的婚姻/继承/家庭形成会建立在被污染的基线上。guide §23 Wave 6 明确点名 "invalid relationships / person married to incompatible state"。
- 最小修复方向：`eligibleBirthHouseholds` 增加双方 `partnerId` 互指的硬条件（一行）；`person.born` payload 附 `householdId` 与父母 id（Wave 3 落 parentIds 字段，但资格守卫现在就该有）。
- 能抓住它的测试：跑 30 年、含大量单人家庭的 sim，对每个 `person.born` 断言其出生家庭的两名成年成员 `partnerId` 互指（当前实现必失败）。

### RT1-02 [HIGH] 死亡不清配偶状态：'widowed' 全仓库从未赋值，在世配偶永远 'married' 指向死者

- 文件：`packages/simulation/src/demography.ts:52-78`（死亡路径只清 job 和 household）；`packages/simulation/src/types.ts:10`
- 证据：死亡处理（demography.ts:58-77）依次做 `alive=false`、释放 job（:61-67）、移出 household（:69-75），唯独不碰 `partnerId`/`maritalStatus`。grep 证实 `'widowed'` 仅出现在 `types.ts:10,58` 的类型声明里，无任何赋值点。invariants.ts:83-96 之所以保持绿色，是因为"married+partner 存在且互指"恰好仍成立——被审计的状态机在第一例死亡后就与真实语义脱节，而不变量却检测不到。
- 失败模式：所有"已婚人口"统计从第一个死亡月起系统性虚高；Wave 3 婚姻状态机、丧偶再婚、继承逻辑都拿到错误输入。guide §23 点名 "dead people acting"（死者仍作为活人的在配配偶存在于婚姻语义中）。
- 最小修复方向：死亡时设置配偶 `maritalStatus='widowed'`、`spouse.partnerId=null`（死者 `partnerId` 保留或清空，二选一并写入 DECISIONS）；同步调整 invariants.ts:94 的 `nonmarried-partner-null`（widowed+null 本就合法，无需改）。
- 能抓住它的测试：构造必然发生死亡的 run（老年初值），首次已婚死亡后断言配偶 `maritalStatus==='widowed'`（当前实现失败，状态仍是 'married'）。

### RT1-03 [MEDIUM] 终点 tick 上排期的系统永不触发：最后一年的经济/心理指标整体丢失，引擎只给 invariants 打了补丁

- 文件：`packages/simulation/src/engine.ts:65-75,84-89`；`packages/core/src/scheduler.ts:97-113`；`packages/economy/src/system.ts:43-50`；`packages/psychology/src/system.ts:32-39`
- 证据：`fireDue(untilTick)` 只触发 `top.tick < untilTick`（scheduler.ts:100 `if (top === undefined || top.tick >= untilTick) { …push(top); return }`）。`economyMetricsSystem.nextFireTick = nextYearStart`（首个 = 8640），而 `run(1)` → `stepTo(8640)` 恰好停在 8640 —— 该系统一次都不触发；10 年 run 只在 8640..77760 触发 9 次，第 10 年边界 86400 不触发。心理月度指标（psychology/system.ts:32，tick%720===0）同理丢最后一期。引擎作者显然意识到了终点问题，但只修了 invariants：`engine.ts:87-89` 在 `run()` 末尾手工补了一次 `checkInvariants`——经济/心理指标没有对应补丁，不对称即是证据。
- 失败模式：1 年期 CLI manifest 与 10k×1y 基准的 digest 中根本没有 `employment_rate`/`mean_wealth`/`wealth_gini`/`stress.mean`；`printSummary`（main.ts:105-106）打印 'n/a'。跨 run 对比 digest 时这些缺失是静默的。
- 最小修复方向：`run()` 末尾像补 invariants 一样补一次 `recordEconomyMetrics(ctx)`（并触发心理学月末采样），或让 `stepTo` 在 `setTick(target)` 前触发 `=== target` 的条目。
- 能抓住它的测试：1 年 sim 后断言 `metrics.gaugeValue('employment_rate')` 已由 `economyMetricsSystem` 记录（当前实现 gauge 不存在，失败）。注意 `system.test.ts:25-27` 把"11 个月度采样"写成期望值，恰恰把丢第 12 期固化成了"正确行为"。

### RT1-04 [MEDIUM] EventLog.append 越窗后每次 splice(0,…) 前移整窗：O(window)/事件，落在最热路径上

- 文件：`packages/core/src/events.ts:90-93`
- 证据：

```ts
this.recent.push(event)
if (this.recent.length > this.recentWindow) {
  this.recent.splice(0, this.recent.length - this.recent.length + …) // 实际: splice(0, len-window)
}
```

  默认窗口 1000（events.ts:83），每次溢出 append 对 1000 元素数组做 `splice(0,1)`，整体前移 ~999 个元素。事件经 `context.ts:28` 的 `events.onAny → log.append` 无一漏网。规模实测：10k×10y = 14.59M 事件（benchmarks/RESULTS.md:17）→ 约 1.4e10 次元素搬移（≈100GB+ memmove），估计占总运行时间（894s）的 1-3%，并叠加在每条 income/consumption 事件上。
- 失败模式：随事件量线性放大的常数开销；窗口越大（有人调大 recentWindow 观测）退化越重。
- 最小修复方向：环形缓冲（head 指针 + 取模），append O(1)。
- 能抓住它的测试：现有 `events.test.ts:38-54` 已验证窗口语义，重构后应保持绿色；可加一条 1e6 次 append 的性能冒烟（预算 < 200ms）。

### RT1-05 [MEDIUM] createHousehold 用 persons.find 解析成员：种群生成期 O(N²)

- 文件：`packages/simulation/src/factory.ts:82`
- 证据：

```ts
for (const memberId of memberIds) {
  const person = ctx.world.persons.find((p) => p.id === memberId)   // O(N) per member
```

  生成期每人恰好入一次户 → N 次 find × O(N) 扫描 = O(N²)。10k 人口 ≈ 5e7 次比较（在 21s 的 10k×1y 基准里约占 0.2-0.5s）；未来 100k（P3 之后）≈ 5e10 → 分钟级。同文件 `createPerson` 用的是 `ids.issued()` 计数器，没有这个问题——纯属一处遗漏。
- 失败模式：种群生成耗时随 N 平方增长；与 KI-1/KI-2 一起构成 10k×100y 的三重障碍。
- 最小修复方向：调用方传入 `buildIndex(world).personById`（context.ts:52 现成）或先建一次局部 Map。
- 能抓住它的测试：50k 人口生成冒烟测试 + 时间预算；正确性由现有 invariants 覆盖。

### RT1-06 [LOW] 死亡/退休/求职路径的重复线性扫描（ employers.find / households.find ）

- 文件：`packages/simulation/src/demography.ts:62,70`；`packages/economy/src/flows.ts:162,182`
- 证据：demography.ts:62 每例死亡 `world.employers.find(...)`、:70 每例死亡 `world.households.find(...)`；flows.ts:162 每个退休者、:182 每个求职者都 `world.employers.find(...)` 从下标 0 重扫。10k×10y 量级：死亡 ~1e4 × H≈5e3 ≈ 5e7、求职 ~2e5 × E≈313 ≈ 6e7 —— 当前摊销可接受（秒级），故定 LOW。但注意 :182 的 first-fit 还有一个建模偏斜：求职者永远填满"下标最小的有空位雇主"，雇主序号与工资档绑定后形成路径依赖的就业分布（不是 determinism bug，建议在 DECISIONS 里记录）。
- 最小修复方向：系统入口构建一次 `WorldIndex`（已存在）；求职用空闲槽位列表。
- 能抓住它的测试：slot 一致性已有 invariant + labor-market.test.ts:31-47 把守；偏斜若非本意，加雇主选择的分布断言。

### RT1-07 [LOW] EventLog.assertMonotonic 是死代码：§27"事件 tick 不回退"保证未接线

- 文件：`packages/core/src/events.ts:110-114`
- 证据：grep 全仓库，`assertMonotonic` 仅在定义处与 `events.test.ts:59-60` 出现，无任何生产调用。当前 `clock.setTick`（clock.ts:31-36）+ 调度器升序 context 使风险处于潜伏态，但 guide §27 的这条不变量实际没有运行时守卫——任何未来系统若缓存 ctx 延迟 emit，不会有任何东西拦截。
- 最小修复方向：在 `EventLog.append` 内直接调用 `assertMonotonic(event.tick)`（一行）。
- 能抓住它的测试：`events.test.ts:56-61` 已存在，接线后自动生效。

### RT1-08 [LOW] 基准的 peakRssMB 实为运行结束后单次 RSS 采样，不是峰值

- 文件：`benchmarks/bench.ts:25`
- 证据：`const rss = process.memoryUsage().rss / (1024 * 1024)` 在 `sim.run()` 之后取一次。GC 时机使其既低估峰值又不可复现，而 RESULTS.md:11,17 将其作为 "peak RSS" 证据记录（guide §26 / HT-33 要求 benchmark 真实测量）。
- 最小修复方向：用 `process.resourceUsage().maxRSS`，或运行中按年采样取 max。
- 能抓住它的测试：不适用（观测层），建议在 RESULTS.md 标注口径。

### RT1-09 [LOW] invariants 不检查 household 成员唯一性/互斥性

- 文件：`packages/simulation/src/invariants.ts:61-68,99-106`
- 证据：person 侧只查"自己引用的 household 存在且成员表包含自己"；household 侧只查"成员 id 存在"。均不检查：(a) `memberIds` 重复；(b) 同一 person 出现在两个 household 的成员表里。Wave 3 的婚姻分户/离婚拆户正是要写这些数组的代码，一旦写错（人挂在两户）现有套件全绿。
- 最小修复方向：扫 household 时统计每人被引用次数，要求与 `householdId !== null` 一一对应。
- 能抓住它的测试：fixture 变异——把一个人塞进第二个 household 的 memberIds，断言 `InvariantViolation`（当前不抛）。

### RT1-10 [LOW] consumptionAccumulator 按 person.id 累积且从不清理：随累计人口无界增长

- 文件：`packages/economy/src/flows.ts:81-88,126-135`
- 证据：`dailyConsumption` 跳过死者（:105）后，死者的 accumulator 条目永久滞留在 `ctx.extensions` 的 Map 里。10k×10y 含出生 → 数万陈旧条目。量小（MB 级）但严格无界，且这是 KI-2 之外独立的小泄漏。架构上没有问题（存 ctx.extensions 而非模块级变量，context.ts:19-20 注释明确）。
- 最小修复方向：flush 时若人已死则 `map.delete(id)`。
- 能抓住它的测试：3 年 run 后断言 accumulator size 接近存活数而非累计出生数（当前失败）。

### RT1-11 [LOW] 心理学层 clamp01 把非有限值静默归 0：NaN 被吞掉而非暴露

- 文件：`packages/psychology/src/update.ts:74-77`；`stress.ts:71-74`；`affect.ts:45-48`；`needs.ts:34-37`；`wellbeing.ts:25-28`
- 证据：五处 `clamp01` 都是 `if (!Number.isFinite(v)) return 0`。上游若引入 NaN，值被静默洗成 0，`psychology-values-in-domain`（invariants.ts:137-141）永远无法触发。对比：money 层对非有限值抛错（money.ts:13-16）、metrics.gauge 抛错（metrics.ts:22）——同一仓库两种哲学，心理学层选了掩盖。
- 失败模式：上游数值 bug 以"全员心理指标悄悄趋向 0"的形式呈现，极难归因。
- 最小修复方向：clamp01 遇非有限值抛错（或在测试/调试构建抛错）。
- 能抓住它的测试：向 `dailyPsychologyUpdate` 传 NaN 环境值，期望 throw（当前静默返回 0）。

### RT1-12 [LOW] samplePerson 是零调用者的死代码，且内部 O(N) filter

- 文件：`packages/simulation/src/population.ts:156-160`
- 证据：grep 全仓库无调用者。作为导出工具函数，未来第一个使用者会把它放进某个循环（其内部 `persons.filter(p => p.alive)` 每次全量扫描），重蹈 KI-2。
- 最小修复方向：删除；或改为基于 `buildIndex` 的 O(1) 随机存取说明。
- 能抓住它的测试：不适用（死代码删除即可）。

### RT1-13 [LOW] CLI runId 未消毒直接拼进文件路径：字符串 seed 可注入路径分隔符

- 文件：`apps/simulation-cli/src/main.ts:61,85-89`；`main.ts:128`
- 证据：`runId = run-${args.seed}-${configHash}`，`args.seed` 为任意非纯数字字符串（parseArgs :128 只判断 `/^\d+$/` 决定是否 Number），`writeFileSync(path.join(out, runId + '.json'))`。`--seed ../evil` 会写出目录外文件。仅 CLI/观测层，定 LOW。
- 最小修复方向：文件名只使用 `configHash` 或对 seed 做 `[^A-Za-z0-9_-]` 替换。
- 能抓住它的测试：`runCli({ seed: 'a/b', out: tmp })` 断言文件落在 tmp 内。

### RT1-14 [INFO] 空 household 永不移除；persons/households/employers 数组只增不减

- 文件：`packages/simulation/src/demography.ts:69-75`
- 证据：死者被移出 memberIds，但空 household 对象永久留存。v1 中 household 只在生成期创建、出生不建户，总量有界；Wave 3 婚姻建户后变为无界。与 KI-3 同属"死亡语义"决策，合并处理即可。死者 wealth/mantle 冻结、psychology 冻结均为显式 `if (!alive) continue` 语义，一致。

### KI-2 补充深度（不另立新条目）

- 文件：`packages/psychology/src/system.ts:29`
- 证据：`ctx.rng.fork(`psychology:${tick}:${person.id}`)` 每人-日分配 1 个模板字符串 + 1 个派生串 + 1 个含 6 个闭包的 Rng 对象；10k×10y ≈ 3600 万次。fork 派生只依赖根 seed 与 label（rng.ts:76-78），label 设计本身是 replay-safe 的正确做法，但分配成本是日度扫描（KI-2）常数项的主要构成之一。可在 KI-2 修复时一并考虑轻量流复用（同 tick 单流顺序抽取也完全确定，只是重排后需要重标 label 方案）。

---

## 专项核查结论（guide §23 Wave 6 攻击面逐项）

### Determinism
- `Math.random`：grep 全 src 仅命中注释（rng.ts:5、formation.ts:37）。**干净**。
- 墙钟：`Date.now`/`new Date`/`toISOString` 仅在 `apps/simulation-cli/src/main.ts:46,47,57,58` 与 `benchmarks/bench.ts`（观测层，允许）。`performance.now`/`process.hrtime` 零命中。**合规**。
- Map/Set 遍历：所有进入序列化/digest 的输出均已排序（metrics.ts:64、ids.ts:22、events.ts:118、stable.ts:26、graph.ts:77,83）。两处未排序遍历（events.ts:64 handler 列表、invariants.ts:142 personality 条目）不产生顺序敏感输出。**干净**。
- 对象键序：`stableStringify` 递归排序键；`MetricsRegistry.snapshot` 全局排序。**干净**。
- 浮点货币：零违例。所有货币运算经 `@genesis/shared` 整数 helpers；`scaleMoney` 的浮点因子带显式舍入策略；`financialStrainOf`/`wealthGini` 的浮点仅用于指标非货币。digest 对浮点统一 round6（engine.ts:154-156）。**干净**。
- 并发：单线程事件循环，调度器 min-heap (tick, priority, seq) 全序。**干净**。

### Correctness
- 不可能年龄：`age-nonnegative` invariant 在守；负 birthTick 回溯技巧数值自洽（population.ts:27）。
- 负财富：消费端 `Math.min(desired, wealth)` 封顶 + daily probe 测试（flows.test.ts:28-42）；payroll 只加。**已防**。
- 重复 ID：`buildIndex` 对 person/household/employer 均抛错（context.ts:55,60,65）；月度 invariant 复核。
- 死者行动：psychology/economy/demography 均 `if (!alive) continue`；`dead-not-employed` invariant 在守。缺口仅在配偶状态（RT1-02）与 KI-3。
- 概率越界：`rng.bool` 对 p∉[0,1] 抛错；hazard clamp [0,0.5]；config 概率在 normalizeConfig 校验。**干净**。
- 除零/NaN：`STRAIN_MIN_MONTHLY_BURN_CENTS` 托底除法（indicators.ts:19,41）；wealthGini 对 n=0/Σw=0 返回 0；tickToDate 校验。唯一 NaN 隐患是 clamp01 吞 NaN（RT1-11）。
- 事件 tick 回退：clock.setTick 硬保证 + EventBus 校验非负整数；但 `assertMonotonic` 未接线（RT1-07）。
- 孤儿引用：partner/household/relationship/employer 双向检查均在；缺 household 互斥性（RT1-09）。

### Performance
- O(N²)：两处实锤——生成期 createHousehold.find（RT1-05，量级 ~5e7@10k）；RT1-06 组合扫描当前摊销可接受。社交图 O(N²) 即 KI-1（不重复）。
- 重复全量扫描：日度系统 = KI-2（不重复）；月末/年度一次性扫描在可接受范围。
- 过度分配：EventLog.splice（RT1-04）+ 心理学 fork 分配（KI-2 补充）。digest() 的 per-person 快照对象仅每 run 一次，可接受。
- 无界内存：consumptionAccumulator（RT1-10）、空 household（RT1-14）；事件原始历史已封窗（设计正确）。
- 基准真实性：10k 人口确实全量参与（RESULTS.md:17 有 14.59M 事件、2.18M 边佐证）；但 peak RSS 口径失真（RT1-08）。

### Architecture
- 重复抽象：**未发现**。Person/RNG/EventBus/EventLog/Metrics/Scheduler/RelationshipGraph 全仓库各仅一份实现；`@genesis/test-utils` 别名指向不存在的目录但零引用（无害）。
- 依赖方向：grep 全部 `@genesis/*` import，严格满足 shared ← core ← simulation ← domain ← apps，无环、无跨层私有导入（跨域连接集中在 apps/simulation-cli/src/profile.ts 的桥接层，正是 ARCHITECTURE 要求的形态）。
- 隐藏全局状态：grep 模块级 `let`/可变 Map/数组常量，src 内零命中；consumptionAccumulator 存 ctx.extensions，显式可注入。
- God file：最大 src 文件 flows.ts 195 行，无 god object；SimContext 是数据+服务束，边界清晰。

### Tests（抽检 18 个，通读全部 125 个用例）
- **真实测机制的正面样本**（破坏实现必失败）：
  1. `flows.test.ts:70-99` 收支守恒精确到分（income 事件和 − consumption 事件和 === 全体财富差），任何一分钱泄漏即红。
  2. `flows.test.ts:13-42` priority-25 日度探针，运行中逐日抓非整数/负财富。
  3. `simulation/tests/invariants.test.ts:14-84` 变异法：注入 NaN 财富、10.5 财富、死而受雇、1.5 stress、断链 partner，逐条断言 invariant 名——这是教科书式的测试。
  4. `simulation/tests/replay.test.ts:8-23` 同 seed 同 digest + 分步 vs 一次到位 digest 相等，能抓住任何 tick/调度偏差。
  5. `core/tests/scheduler.test.ts:9-54` 精确断言触发序列与 (priority, seq) 平局规则。
  6. `economy/tests/labor-market.test.ts:51-77` 通过整体平移 birthTick 加速老化，真触发退休机制而非 mock。
  7. `psychology/tests/personality.test.ts:51-75` Pearson 相关幅度检验双因子模型（区分独立均匀分布 |r|≈0.045 与 >0.1）。
  8. `psychology/tests/boundaries.test.ts` 500 天极值压力、1e9 天 decay、±1e9 冲击，NaN/越界全覆盖。
  9. `core/tests/events.test.ts:38-54` 有界窗口 + 计数 + first/last tick 精确断言。
  10. `apps/simulation-cli/tests/fullstack.test.ts:40-54` 失业压力→应激方向的真实机制检验（EXP-002）。
- **弱点**：
  - `fullstack.test.ts:20` `expect(stats.byType['person.died']).toBeGreaterThanOrEqual(0)` —— 对已定义计数恒真，近乎空断言（300 人 3 年应要求 > 0）。
  - `psychology/tests/system.test.ts:25-27` 把"11 次月度采样"固化为期望值，掩盖了第 12 期在终点 tick 被丢弃的事实（RT1-03）。
  - 关键路径缺测：死亡→配偶状态（RT1-02）、出生资格/亲缘（RT1-01）、终点期指标（RT1-03）、事件单调接线（RT1-07）、household 互斥（RT1-09）——均无任何测试覆盖，这正是这些缺陷得以存活的原因。

---

## 审计范围声明

- **深查**（逐行读 src + tests）：`packages/core`、`packages/shared`、`packages/simulation`、`packages/economy`、`packages/psychology`、`apps/simulation-cli`、`benchmarks/bench.ts`、`vitest.config.ts`、根配置。
- **grep 级扫描**（并行开发中，按任务约束不做深度审计）：`packages/social`（import 依赖、edge 生命周期关键词 prune/decay/alive/MAX、排序行为）、`packages/family`（仅 package.json，尚无源码——其"未完成"状态不计入发现）。
- **未审**：`PROJECT_GENESIS_GUIDE.md` 全文一致性（仅核对 §23/§27/HT-32 相关条款）、`docs/agent/*` 流程文档的正确性。
- 测试审计方式：抽检 18 个用例做逐行机制分析（要求 >15），并通读其余用例；125 个用例分布于 26 个文件。

## 总结论

**PASS WITH ISSUES**

Determinism 与 Architecture 两个攻击面几乎无懈可击（Math.random/墙钟/键序/浮点货币/重复抽象/隐藏全局全部干净，测试质量整体很高）。扣分项集中在 Correctness 的两个建模缺口（RT1-01 非配偶可生育且无亲缘记录、RT1-02 丧偶状态机断裂）——二者都是 Wave 3 动工前必须回填的地基，以及一个静默的观测口径问题（RT1-03 终点期指标丢失）和三处量化的性能常数项（RT1-04/05/KI-2 补充）。无 BLOCKER；所有发现均有 文件：行号 级证据与最小修复方向，建议按 RT1-01 → RT1-02 → RT1-03 → RT1-05 → RT1-04 的顺序回流 Backlog（前两条必须先于 Wave 3 merge queue）。
