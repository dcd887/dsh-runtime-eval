# mock-doc-read · 行为级评测

- 仓库：https://github.com/dcd887/dsh-doc-read
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:10:02.086Z
- **结果：9/10 通过（90%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | 12 页 PDF 的 doc_outline 应返回 12 页 | ✅ | 0 ms | equals: ok |
| 2 | doc_outline 应返回 title 字段 | ✅ | 0 ms | equals: ok |
| 3 | 文件不存在时应抛错 | ✅ | 0 ms | threw as expected: file not found: fixtures/missing.pdf |
| 4 | 读第 3-5 页，应只返回 3 页内容 | ✅ | 0 ms | containsAll: ok; containsNone: ok |
| 5 | 只读第 1 页，应只有第 1 页 | ✅ | 0 ms | containsAll: ok; containsNone: ok |
| 6 | 读第 11-99 页，应只返回 11、12 两页（不抛错） | ✅ | 0 ms | containsAll: ok; containsNone: ok |
| 7 | from < 1 时应抛错 | ✅ | 0 ms | threw as expected: from must be >= 1 |
| 8 | 搜存在的词，命中数应 >= 1 | ✅ | 0 ms | length 2 >= 1: ok |
| 9 | 搜不存在的词，命中数应为 0 | ✅ | 0 ms | empty: ok |
| 10 | 故意失败：期望 999，实际 12 | ❌ | 0 ms | equals: 12 !== 999 |
