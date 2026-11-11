# dsh-ledger-memory · 行为级评测

- 仓库：https://github.com/18477514055/dsh-ledger-memory
- 测试于：
- 时间：2026-11-11T08:41:52.554Z
- **结果：7/8 通过（87.5%）**

| # | 断言 | 结果 | 耗时 | 说明 |
|---|---|---|---|---|
| 1 | ledger_status 对存在的空目录应返回 ok=true | ✅ | 250 ms | equals: ok |
| 2 | 空目录应报告 initialized=false | ✅ | 220 ms | equals: ok |
| 3 | 没登记过账本时 ledger_read 应 found=false（不是抛错） | ✅ | 6 ms | equals: ok |
| 4 | ledger_read 缺 target 时默认读 active，不抛错 | ✅ | 3 ms | equals: ok |
| 5 | 未启用活动日志时 ledger_log 应 ok=false 并给出提示 | ✅ | 4 ms | equals: ok |
| 6 | 没有 root、也没有会话 cwd 时应抛错 | ✅ | 0 ms | threw as expected: project-ledger: 这个执行没有可用的会话工作目录（agent.session.header.cwd），无法定位项目根。若本会话是从容器工作区开的，请用 root 参数点名子项目目录。 |
| 7 | ledger_conform 不带 apply 时应只检查不改动（changed=false） | ✅ | 4 ms | equals: ok |
| 8 | 故意失败：空的 scratch 目录期望已初始化 | ❌ | 228 ms | equals: false !== true |
