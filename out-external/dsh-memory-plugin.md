# dsh-memory-plugin · 行为级评测

- 仓库：https://github.com/2132774831/dsh-memory-plugin
- 测试于：
- 时间：2026-11-11T08:41:52.848Z
- **结果：5/6 通过（83.3%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | memory_list 应返回非空文本（空库也要给提示） | ✅ | 2 ms | length 8 >= 1: ok |
| 2 | memory_review 应返回非空体检文本 | ✅ | 10 ms | length 16 >= 1: ok |
| 3 | memory_search 缺 query 应返回提示文本而不是抛错 | ✅ | 3 ms | containsAll: ok |
| 4 | memory_forget 缺 id 应返回提示文本而不是抛错 | ✅ | 2 ms | containsAll: ok |
| 5 | 搜不存在的词应返回非空文本（无结果也说明清楚） | ✅ | 2 ms | length 38 >= 1: ok |
| 6 | 故意失败：memory_list 期望含一个不可能出现的串 | ❌ | 1 ms | missing: <DELIBERATE-FAIL: 不该出现> |
