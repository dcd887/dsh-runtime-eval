# dsh-brief-pack · 行为级评测

- 仓库：https://github.com/dcd887/dsh-brief-pack
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:09:47.603Z
- **结果：9/10 通过（90%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | 传 1 个文件，filesPacked 应有 1 项 | ✅ | 11 ms | length 1 >= 1: ok |
| 2 | 生成的包不应超过预算（含 20% 估算余量） | ✅ | 5 ms | 1046 <= 2400: ok |
| 3 | budgetTokens 应原样回显 | ✅ | 3 ms | equals: ok |
| 4 | 应返回 briefPath | ✅ | 4 ms | containsAll: ok |
| 5 | 6 KB 文件在 8000 预算下不应截断 | ✅ | 5 ms | empty: ok |
| 6 | 有 hint 时应记录命中的关键词 | ✅ | 4 ms | length 1 >= 1: ok |
| 7 | 应标注 token 是估算值 | ✅ | 6 ms | containsAll: ok |
| 8 | 有 hint 时 method 应为 hint | ✅ | 2 ms | equals: ok |
| 9 | 文件不存在时不抛错，而是在 filesPacked[0].kind 标 missing | ✅ | 2 ms | equals: ok |
| 10 | 故意失败：期望 approxTokens=99999 | ❌ | 3 ms | equals: 1392 !== 99999 |
