# dsh-memory-band · 行为级评测

- 仓库：https://github.com/13576751971/dsh-memory-band
- 测试于：
- 时间：2026-11-11T08:41:52.691Z
- **结果：5/6 通过（83.3%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | action=stats 应返回记忆条数与用量 | ✅ | 3 ms | containsAll: ok |
| 2 | recall 一个不存在的词应明确说没找到 | ✅ | 0 ms | containsAll: ok |
| 3 | recall 缺 query 应抛错 | ✅ | 0 ms | threw as expected: memory_band: recall 需要 query |
| 4 | 非法 action 应抛错并说明合法取值 | ✅ | 0 ms | threw as expected: memory_band: action 只能是 recall / remember / stats |
| 5 | 缺 action 应抛错 | ✅ | 0 ms | threw as expected: memory_band: action 只能是 recall / remember / stats |
| 6 | 故意失败：stats 期望含一个不可能出现的串 | ❌ | 1 ms | missing: <DELIBERATE-FAIL: 不该出现> |
