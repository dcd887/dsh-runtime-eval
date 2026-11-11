# dsh-mail-reader · 行为级评测

- 仓库：
- 测试于：DSH 0.2.1-alpha.2
- 时间：2026-11-11T09:09:58.395Z
- **结果：9/10 通过（90%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | mail_probe 应连通并返回 ok=true | ✅ | 760 ms | equals: ok |
| 2 | 网易 IMAP 端口应为 993 | ✅ | 1870 ms | equals: ok |
| 3 | 应是只读模式（readonly=true） | ✅ | 674 ms | equals: ok |
| 4 | mail_list 应返回 ok=true | ✅ | 839 ms | equals: ok |
| 5 | days=9999 应被 clamp 到上限 365 | ✅ | 693 ms | equals: ok |
| 6 | mail_search 无关键词应直接抛错（不发 IMAP 请求） | ✅ | 0 ms | threw as expected: mail_search needs "subject" and/or "from". |
| 7 | mail_read 的 uid 非数字应抛错 | ✅ | 0 ms | threw as expected: mail_read needs a numeric uid from mail_list. |
| 8 | mail_read 的 uid 不存在应抛错 | ✅ | 1491 ms | threw as expected: no header data returned for uid 999999999 |
| 9 | 搜绝对不存在的主题应为 0 封 | ✅ | 623 ms | equals: ok |
| 10 | 故意失败：uid 非数字本应抛错，这里却期望 ok=true | ❌ | 0 ms | unexpected error: mail_read needs a numeric uid from mail_list. |
