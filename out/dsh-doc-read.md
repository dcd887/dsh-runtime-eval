# dsh-doc-read · 行为级评测

- 仓库：https://github.com/dcd887/dsh-doc-read
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:09:51.358Z
- **结果：10/11 通过（90.9%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | 2 页 PDF 的 doc_outline 应返回 pages=2 | ✅ | 538 ms | equals: ok |
| 2 | kind 应为 pdf | ✅ | 5 ms | equals: ok |
| 3 | outline 数组应有 2 项 | ✅ | 4 ms | length 2 >= 2: ok |
| 4 | 第 1 页的 head 应提到 page one | ✅ | 4 ms | containsAll: ok |
| 5 | 文件不存在时应抛错 | ✅ | 0 ms | threw as expected: 文件不存在: C:/nope/missing.pdf |
| 6 | 读第 1 页，range 应为 1-1，returned 应为 1 | ✅ | 4 ms | equals: ok |
| 7 | 读第 1 页时 body 应只有 1 项 | ✅ | 2 ms | length 1 >= 1: ok |
| 8 | 第 1 页正文应包含 fixture-alpha | ✅ | 3 ms | containsAll: ok |
| 9 | 搜 fixture 应有命中 | ✅ | 3 ms | 4 >= 1: ok |
| 10 | 搜绝对不存在的词应为 0 命中 | ✅ | 4 ms | equals: ok |
| 11 | 故意失败：期望 pages=999，实际 2 | ❌ | 4 ms | equals: 2 !== 999 |
