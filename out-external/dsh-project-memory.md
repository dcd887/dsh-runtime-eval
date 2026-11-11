# dsh-project-memory · 行为级评测

- 仓库：https://github.com/00080000/dsh-project-memory
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T08:41:53.225Z
- **结果：8/9 通过（88.9%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | memory_stats 应返回存储概况文本 | ✅ | 6 ms | containsAll: ok |
| 2 | 空 store 下 list_tasks 应提示任务记录为 0 套而不是报错 | ✅ | 2 ms | containsAll: ok |
| 3 | show_task_panel 应返回「已请求打开任务面板」 | ✅ | 0 ms | containsAll: ok |
| 4 | query_memory 缺 query 应抛参数错误 | ✅ | 1 ms | threw as expected: invalid arguments: missing required property "query" |
| 5 | 无 llm 时 query_memory 应走降级（返回无匹配提示）而不是崩溃 | ✅ | 12 ms | containsAll: ok |
| 6 | remember 缺 problem/solution 应抛参数错误 | ✅ | 1 ms | threw as expected: invalid arguments: missing required property "problem"; missing required property "solution" |
| 7 | forget 缺 id_or_query 应抛参数错误 | ✅ | 0 ms | threw as expected: invalid arguments: missing required property "id_or_query" |
| 8 | memory_stats 返回值应是足够长的文本（不是空串） | ✅ | 1 ms | length 250 >= 30: ok |
| 9 | 故意失败：memory_stats 期望含一个不可能出现的串 | ❌ | 1 ms | missing: Files indexed: 999999999 |
