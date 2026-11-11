# project-dashboard · 行为级评测

- 仓库：
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:08:22.309Z
- **结果：12/13 通过（92.3%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | payload 的 schemaVersion 应为 1 | ✅ | 52 ms | equals: ok |
| 2 | generatedAt 应是 ISO 8601 时间戳 | ✅ | 3 ms | matches /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/: ok |
| 3 | dataFile 应指向 data.json | ✅ | 0 ms | matches /data\.json$/: ok |
| 4 | 读到的 data.json 应含 schemaVersion=1 | ✅ | 1 ms | equals: ok |
| 5 | 数据集里应有至少 1 个分组 | ✅ | 1 ms | length 8 >= 1: ok |
| 6 | 数据集读取成功时不应带 error 字段 | ✅ | 0 ms | empty: ok |
| 7 | 有 fixture 时 GitHub 快照应抓取成功（status=ok） | ✅ | 1 ms | equals: ok |
| 8 | 应汇总出 2 个仓库 | ✅ | 1 ms | equals: ok |
| 9 | 列表应按 pushed_at 降序，最新的 beta 排第一 | ✅ | 1 ms | equals: ok |
| 10 | 两个都是 public，publicCount 应为 2 | ✅ | 1 ms | equals: ok |
| 11 | 2 条少于 perPage=10，分页应只请求 1 页 | ✅ | 1 ms | length 1 >= 1: ok |
| 12 | 无 AtomGit fixture 时应降级为 unavailable 而不是抛错 | ✅ | 1 ms | equals: ok |
| 13 | 故意失败：schemaVersion 期望 999 | ❌ | 0 ms | equals: 1 !== 999 |
