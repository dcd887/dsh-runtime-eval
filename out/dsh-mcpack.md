# dsh-mcpack · 行为级评测

- 仓库：https://github.com/dcd887/dsh-mcpack
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:08:19.404Z
- **结果：6/7 通过（85.7%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | 列表应返回 ok=true | ✅ | 518 ms | equals: ok |
| 2 | 应有 13 个实例目录 | ✅ | 494 ms | equals: ok |
| 3 | 应有 12 个有效实例 | ✅ | 465 ms | equals: ok |
| 4 | instances 数组不应为空 | ✅ | 482 ms | length 13 >= 1: ok |
| 5 | 第一个实例应有 mc_version | ✅ | 465 ms | length 6 >= 1: ok |
| 6 | 第一个实例应有 loader | ✅ | 432 ms | length 5 >= 1: ok |
| 7 | 故意失败 | ❌ | 442 ms | equals: 13 !== -1 |
