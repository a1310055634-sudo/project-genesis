# KI-2 性能画像（HT-24.6 数据先行）— 2026-09-15

> 方法：`NODE_OPTIONS="--cpu-prof"` 对 10k×3y（seed 42）跑 V8 CPU 采样，46,598 样本 ≈ 50s 墙钟。
> 画像文件：`out/profile/CPU.20260915.235526.9648.0.001.cpuprofile`（gitignored）。
> 下表百分比为全样本自时间的占比（绝对秒数按 50s 墙钟折算）。

## 热点分布

| 排名 | 热点 | 占比 | 归因 |
|---|---|---|---|
| 1 | graph.ts 边操作（allEdges 10.5 + edgeKey 10.1 + byKey 7.9 + edge 6.7 + neighborsOf 0.8） | **36.0%** | 社交图以字符串 id 为键：每次边查询都做 `edgeKey(a,b)` 字符串拼接 + Map get；allEdges 返回全量数组拷贝 |
| 2 | RNG 派生（createRng 8.3 + fnv1a 3.3） | **11.6%** | 主因：`psychology/system.ts:29` **每人每天** fork（`psychology:${tick}:${person.id}`）→ 每天 1 万次长字符串 fnv1a 哈希；次因：各系统每 tick fork |
| 3 | GC | **8.7%** | 每 tick/每次 fire 重建临时 Map（tieCounts、byId、burdenByPerson、personsById 等）的分配压力 |
| 4 | profile.ts 注入闭包（anon） | 7.9% | affinity/conflict/tieCounts/skillRateModifier 闭包被高频调用；tieCounts 每次 media fire 全图迭代 + 排序拷贝 |
| 5 | pruneEdges + weeklySocialUpdate + pickPartner（social/formation） | 7.8% | 与 1 同根：社交图结构成本 |
| 6 | buildHousingBurdenByPerson | 4.5% | housing 每月按人重算负担 |
| 7 | 日度全量扫描（dailyConsumption 2.2 + dailyPsychologyUpdate 1.8 + decayNeeds 1.2） | **5.2%** | KI-2 原始目标 |
| 8 | 其余（createHousehold、scheduler、invariants、seedFromString…） | ~18% | 分散 |

## 核心结论：KI-2 的前提已经过时

KI-2 记录于 KI-1 修复之前，假设"日度全量扫描"是主要成本。画像显示：
**日度扫描只占 5.2%，社交图操作合计（热点 1+4+5）占 ~51%，其中纯图微开销（字符串键 + Map 拷贝）约 36%。**
事件驱动 per-person 调度重构（大工程）的天花板只有 ~5%，性价比极低。

## 重构方案（按性价比排序）

### KI-2a 社交图微优化包（预计砍 30–40% 总时长，中等工作量）
1. `edgeKey` 结果缓存或改数值 id 键的邻接结构（`personIndex` 已是数字序）——消灭 10.1% 的字符串拼接。
2. `allEdges()` 提供迭代器/复用缓冲，停止全量数组拷贝；`tieCounts` 按 tick memoize（与 education qualityFor 同款 cachedTick 模式，注意 RT6-D1-7 的注册顺序契约）。
3. `byKey`/`edge` 热路径消除重复哈希（嵌套 Map 或 `a|b` 数值对键）。

### KI-2b RNG fork 摊销（预计砍 8–12%，小工作量）
1. `psychology/system.ts`：每人每天的 fork 改为**每天一个 fork + 每人一个确定性偏移**（如先 fork 一次再 `clone`/推进，或 label 改为纯数字拼接降低哈希成本）——保持可复现语义（同 seed 同序列）。
2. 盘点每 tick fork 的系统：label 字符串拼装也是 fnv1a 成本。

### KI-2c 分配压力（预计砍 ~5–8%，随 KI-2a 顺带）
复用跨 fire 缓冲、避免每 tick 重建不变化的 Map（byId 可按 persons.length 失效——controller 已用同款技巧）。

### KI-2d 事件驱动调度（原 KI-2）——降级为低优先级
天花板 ~5%，仅在 KI-2a/b/c 落地后仍有需要（如 10k×100y 目标提前）时再做分区批处理。

## 10k×100y 可行性投影

| 配置 | 10k×1y | 10k×10y | 10k×100y（外推） |
|---|---|---|---|
| 当前代码 | 14.7 s | ~5.5 min | ~55–75 min（人口饱和假设下近线性） |
| KI-2a+b 落地后（估算） | ~9–10 s | ~3.5 min | **~35–45 min** |

结论：**不需要调度重构**，KI-2a+b 两个微优化包即可把 10k×100y 压进 1 小时内，满足 P3 目标。
建议把 KI-2 从 BACKLOG 改写为 KI-2a/b/c 三个小包，KI-2d 挂起。
