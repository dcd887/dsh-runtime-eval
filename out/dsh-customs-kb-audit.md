# dsh-customs-kb-audit · 行为级评测

- 仓库：https://github.com/dcd887/dsh-customs-kb-audit
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:09:50.708Z
- **结果：7/8 通过（87.5%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | 知识库共 1956 条 | ✅ | 628 ms | equals: ok |
| 2 | 官方文号覆盖率应为 100% | ✅ | 606 ms | equals: ok |
| 3 | 应报告数据结构 shape | ✅ | 450 ms | containsAll: ok |
| 4 | 两次运行应字节一致 | ✅ | 301 ms | equals: ok |
| 5 | 质量审计的总数应和结构审计一致 | ✅ | 219 ms | equals: ok |
| 6 | 应检测到模板化描述 | ✅ | 205 ms | 72.6 >= 50: ok |
| 7 | 应输出 year 字段的空值统计（0 空 / 1956 有） | ✅ | 249 ms | equals: ok |
| 8 | 故意失败 | ❌ | 293 ms | equals: 1956 !== 99999 |
