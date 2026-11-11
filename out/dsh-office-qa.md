# dsh-office-qa · 行为级评测

- 仓库：https://github.com/dcd887/dsh-office-qa
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:10:01.510Z
- **结果：2/3 通过（66.7%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | 对一个真 docx 应识别为 docx 并给出字体摘要 | ✅ | 354 ms | equals: ok |
| 2 | 文件不存在时应抛错 | ✅ | 289 ms | threw as expected: Command failed: C:\Python314\python.exe C:\Users\kjds\.dsh\dsh-plugin-work\office-qa\office_qa2.py C |
| 3 | 故意失败 | ❌ | 278 ms | empty: no |
