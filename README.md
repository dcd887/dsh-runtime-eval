# dsh-runtime-eval

**官方测「装不装得上」，我测「用不用得好」。**

DSH 生态现有的兼容性检查停在「进程没死」那一级（dsh.so 的 L5 冒烟、dshmarketplace 的 install-tested）。`runtime-eval` 往下走一步：**给每个插件跑一组真实任务断言，看它做出来的东西对不对。**

---

## 当前实测结果（2026-11-11）

**13 个断言集，覆盖 11 个真插件 + 1 个自检用的 mock。有效通过率 100%（96/96）；含自检用例的原始通过率是 96/109，差额就是每个断言集里那 13 条 `DELIBERATE-FAIL`。**

其中 8 个插件是自研、4 个是第三方（从 awesome-dsh-plugin 索引抽样、clone 下来测的）。

| 插件 | 来源 | 工具数 | 断言数 | 通过 | 主要验证什么 |
|---|---|---|---|---|---|
| **`project-dashboard`** | 自研 | 1 | 12 | **12/12** | 数据集读取、GitHub 分页发现/排序/汇总（fixture 驱动）、AtomGit 降级不崩溃 |
| **`dsh-doc-read`** | 自研 | 3 | 10 | **10/10** | PDF 页数、按页读、关键词命中、不存在文件抛错 |
| **`dsh-brief-pack`** | 自研 | 2 | 9 | **9/9** | 任务包大小、预算回显、hint 命中、缺失文件标记 |
| **`dsh-mail-reader`** | 自研 | 4 | 9 | **9/9** | IMAP 连通、端口 993、只读模式、days 上限 clamp、参数校验抛错 |
| **`dsh-project-memory`** | 第三方 | 12 | 8 | **8/8** | 任务面板、文档索引、`llm` 缺失时查询降级不崩 |
| **`dsh-ledger-memory`** | 第三方 | 22 | 7 | **7/7** | 账本状态/读取/日志/结构检查，`root` 与 `target` 参数处理 |
| **`dsh-customs-kb-audit`** | 自研 | 2 | 7 | **7/7** | 1956 条知识库、覆盖率 100%、幂等、模板化检测 |
| **`dsh-record-search`** | 自研 | 1 | 7 | **7/7** | 索引已建、命中数、耗时、空结果 |
| **`dsh-mcpack`** | 自研 | 4 | 6 | **6/6** | 13 个实例、12 个有效、loader/mc_version 字段 |
| **`dsh-memory-plugin`** | 第三方 | 5 | 5 | **5/5** | 列表/体检/检索文本；缺参返回提示而非抛错 |
| **`dsh-memory-band`** | 第三方 | 1 | 5 | **5/5** | stats/recall，action 枚举与缺参校验 |
| **`dsh-office-qa`** | 自研 | 1 | 2 | **2/2** | docx 识别、缺文件抛错 |
| `mock-doc-read` | mock | 3 | 9 | **9/9** | 判据引擎自身的正确性 |

**每个断言集都含一条 `DELIBERATE-FAIL`**（故意设的、必须失败的断言），所以 `eval:all` 和 `eval:ext` 最后都会显示 FAIL。**那条失败是设计出来的**，用来证明判据引擎真的会判失败。

邮件类断言集另有一条约束：涉及邮件标题/发件人/正文的断言都标了 `redact: true`，`eval.mjs` 因此不把返回值写进 `out/*.json`，只留判定结果，避免邮箱内容落盘。

### mock ctx 的服务面（2026-11-11 补齐）

适配层只提供评测需要的服务；**缺的服务不伪造**，依赖它的注册按 Cordis 语义整段跳过——假装注册成功会让评测结果失真。

| mock 服务 | 行为 |
|---|---|
| `tools.register` | 收集工具（核心） |
| `web.register` / `webServer.register` | 收路由不执行 |
| `web.fetch` | 按断言集的 `mock.web.fixtures` 返回假响应；没命中一律 404，降级路径照旧可测 |
| `inject(deps, cb)` | deps 都在 mockCtx 上才执行 cb；缺了就跳过（与宿主一致） |
| `commands.register` / `skills.register` | 收第三方插件的用户命令和 skill（它们不是工具） |
| `sessionQuery` | 空查询器（record-search 用） |

`web.fetch` 的 fixture 写在断言集 JSON 里，声明式，例如 `{"match": "api.github.com/users/", "json": [...]}`。`project-dashboard` 就是靠它走通了「分页发现 → slimRepo → 按 pushed_at 排序 → 汇总」这条真实数据路径，而不是降级路径。

实测验证：第三方插件 `@yolk_vat-y/dsh-project-memory@0.6.12` 补 `inject` 前 `/tasks` 与 skill 均报 `registration skipped`，补齐后 `commands: 1 / skills: 1 / skipped: 0`，12 个工具不变（命令和 skill 本来就不是工具）。

### 未覆盖的插件

`@local` 下 15 个有效目录，去重后是 **9 个独立插件**（`browser-ops` 的 8 代、`doc-read` 的 3 个别名、`project-dashboard` 的 4 个别名，都指向同一处，不算多个）。已测 8 个，未测 1 个：

| 插件 | 工具数 | 为什么没测 |
|---|---|---|
| `browser-ops8` | 14 | 要起真浏览器（CDP），断言依赖外部环境，单独排期 |

`dsh-feishu-mcp` / `dsh-memory-router` 没有可加载入口，不计入。

按工具数算：18/32 = 56% 被覆盖；未测的 14 个工具全部来自 `browser-ops8`。

---

## 为什么做这个

| 平台 | 做到哪一级 | 数字 |
|---|---|---|
| dsh.so | L5 运行冒烟 | 25,551 → L4 91% → **L5 只 15,587 通过** |
| dshmarketplace.dev | install-tested | 索引 17,387，**只测了 5,675** |
| 36kr 实测 | 运行级只测 5 个 | **静态 41 兼容，运行级可用 0/5** |

**从「能启动」到「能用对」之间是空的。**

---

## 怎么用

### 拿别人的插件来测（三步）

```bash
git clone <插件仓库>                    # 也可以 npm install 到临时目录
node src/eval.mjs init <插件目录>       # 生成断言集骨架（每个工具一条占位）
# 改写 assertions/*.json 里的 expect
node src/eval.mjs <插件目录>            # 跑
```

`init` 生成的每条 `expect` 都是占位，跑起来**一定红**——逼你按真实行为改写，而不是把自动生成的空断言当成已验证。

（发布到 npm 后可用 `npx dsh-runtime-eval` 代替 `node src/eval.mjs`。）

### 本仓库的命令

```bash
npm run eval          # 单跑 dsh-doc-read
npm run eval:brief    # 单跑 dsh-brief-pack
npm run eval:mock     # 单跑 mock
npm run eval:all      # 跑全部 9 个
npm run leaderboard   # 汇总 out/ + out-external/ → out/leaderboard.html
npm run eval:ext      # 跑第三方插件（需先 fetch-external）
node src/scan.mjs     # 扫 @local，列出所有可加载插件和工具
```

### CLI

```bash
dsh-runtime-eval <assertions.json> [--plugin <插件目录>] [--out <输出目录>]
dsh-runtime-eval <插件目录>         # 用它自带的 assertions/*.json
dsh-runtime-eval init <插件目录>    # 生成断言集骨架
dsh-runtime-eval --help
```

`pluginDir` 不写死作者机器路径，三种写法：

| 写法 | 含义 |
|---|---|
| `@local/xxx` | 相对 DSH 的 @local（默认 `~/.dsh/profiles/web/node_modules/@local`，用 `DSH_EVAL_LOCAL` 覆盖）|
| `/abs/path` | 原样 |
| `relative/path` | 相对**断言集文件**所在目录（不是 cwd）|

优先级：`--plugin` > `DSH_EVAL_PLUGIN` 环境变量 > 断言集里的 `pluginDir`。

**输出**：

```
PASS   1  outline-page-count  (224 ms)
...
FAIL  11  DELIBERATE-FAIL  (4 ms)
      equals: 2 !== 999

10/11 passed (90.9%)
out: out/dsh-doc-read.json
     out/dsh-doc-read.md
```

**退出码**：

| 码 | 含义 |
|---|---|
| `0` | 全部通过 |
| `1` | 有失败 |
| `2` | 断言集或插件有问题 |

---

## 断言集格式

```json
{
  "plugin": "dsh-doc-read",
  "origin": "self",
  "pluginDir": "@local/dsh-doc-read3",
  "repo": "https://github.com/dcd887/dsh-doc-read",
  "testedOn": "DSH 0.2.1-alpha.2",
  "assertions": [
    {
      "id": "outline-page-count",
      "task": "2 页 PDF 的 doc_outline 应返回 pages=2",
      "call": { "fn": "doc_outline", "args": { "path": "${ROOT}/fixtures/sample.pdf" } },
      "expect": { "jsonPath": "$.pages", "equals": 2 }
    }
  ]
}
```

### 支持的判据（11 种）

| 判据 | 说明 |
|---|---|
| `equals` | 严格相等 |
| `jsonPath` + `equals` | 取字段后相等 |
| `containsAll` / `containsNone` | 文本包含 / 不包含 |
| `lengthAtLeast` | **数组或字符串**的长度下限 |
| `atLeast` / `atMost` | **数字**比较（不是 `.length`）|
| `matches` | 正则 |
| `isError` | 期望抛错 |
| `isEmpty` | 期望空 |

**`lengthAtLeast` 和 `atLeast` 要分清** —— 这是踩过两次的坑：`hitCount` 是数字，用 `lengthAtLeast` 会取 `.length` 得 -1。

---

## 怎么接一个真实插件

**DSH 插件导出的是 `apply(ctx, config)`，工具在 `apply` 里通过 `ctx.tools.register({ name, execute })` 注册，内部实现函数不导出。**

**`src/adapter.mjs` 做的事**：

1. 造一个假 `ctx`（`effect` 立即执行、`tools.register` 收集工具）
2. 调 `apply(mockCtx, config)`
3. 拿到 `Map<toolName, tool>`
4. 断言集里的 `call.fn` 就写**工具名**

**mock ctx 提供的服务**：

| 服务 | 用途 |
|---|---|
| `tools.register` | 收集工具（核心）|
| `effect` | 立即执行并收集 disposer |
| `webServer` / `web` | UI 插件注册路由，先收集不执行 |
| `sessionQuery` | `record-search` 读历史会话，给空查询器 |

**四个踩过的坑**：

| 坑 | 说明 |
|---|---|
| **路径要绝对路径** | `dsh-doc-read` 用相对路径报「文件不存在」|
| **`pack_brief` 对不存在的文件不抛错** | 在 `filesPacked[0]` 标 `kind: "missing"` + `error` |
| **`@local` 下多是 junction** | 坏链接用 `lstatSync` + `realpathSync` 判，不能只 `statSync` |
| **UI 插件需要 `webServer`** | 不给 stub 会报 `Cannot read properties of undefined (reading 'register')` |

**前两条是「断言写错，不是插件错」** —— 这正是行为级评测要事先确认行为的原因。

### 第三方插件：能测，但有三道坎（2026-11-11 实测）

两条下载通路都实测可用：

| 通路 | 命令 | 实测 |
|---|---|---|
| npm registry | `node src/fetch-external.mjs '<包名>'` | `@yolk_vat-y/dsh-project-memory@0.6.12` 装 16s |
| git clone | `node src/fetch-external.mjs https://github.com/<owner>/<repo>` | `dcd887/dsh-doc-read` clone 2.7s，13 个文件 |

git 通路是 2026-11-11 新验的——`github.com:443` 当时连得上，与旧记录「本机 git 不通」不一致，所以以实测为准（clone 退出码 0）。clone 下来的仓库放 `node_modules/_git_<repo>`，这样它能向上解析到补进来的 `@deepseek-ai` 模块。

**批量抽样实测（2026-11-11）**：从索引 970 个候选里按作者去重取 20 个 → 4 个仓库已不存在 → 16 个 clone 成功 → 5 个真的有工具。失效率 20%，可测率 25%。明细见 `out-external/scan-20261111.json`。

已测的 4 个第三方（断言集在 `assertions-external/`，`pluginDir` 写 `@ext/_git_<repo>`）：

| 插件 | 工具数 | 断言 | 说明 |
|---|---|---|---|
| `dsh-ledger-memory` | 22 | 7 | 只测 status / read / log / conform，其余 17 个会写文件 |
| `dsh-project-memory` | 12 | 8 | 只读工具 + `llm` 缺失时的降级 |
| `dsh-memory-plugin` | 5 | 5 | 缺参返回提示文本，不是抛错 |
| `dsh-memory-band` | 1 | 5 | `action` 枚举校验 |

没测成的：`dsh-read-url`（4 工具）仓库 clone 失败；另有 7 个 clone 下来是 UI 插件，`apply` 跑了但不注册工具——**UI 插件不适合行为级评测**，这是这类项目的能力边界。

npm 插件的完整闭环：

```bash
node src/fetch-external.mjs '@yolk_vat-y/dsh-project-memory'   # 装到 %TEMP% + 补 peer 模块
node src/probe-external.mjs "%TEMP%/rt-eval-plugins/node_modules/@yolk_vat-y"
npm run eval:ext                                                # 跑 assertions-external/ 的断言集
node src/fetch-external.mjs --clean                             # 测完删掉，核对运行时完好
```

git 插件的闭环（没有现成断言集，先 init）：

```bash
node src/fetch-external.mjs https://github.com/dcd887/dsh-doc-read
node src/eval.mjs init "%TEMP%/rt-eval-plugins/node_modules/_git_dsh-doc-read"
node src/eval.mjs "%TEMP%/rt-eval-plugins/node_modules/_git_dsh-doc-read"
node src/fetch-external.mjs --clean
```

`out-external/` 与 git 插件的结果都不进 `out/`，但 `leaderboard` 会一起读并标「来源」列。

**为什么必须补 peer 模块**（三道坎，按踩到的顺序）：

| 坎 | 现象 | 处理 |
|---|---|---|
| optional peerDeps 不装 | `Cannot find package '@deepseek-ai/schemastery'` | 逐个补会递归（schemastery → dsh-tools → cordis） |
| 公共 npm 版本不够 | `@deepseek-ai/dsh-tools` 只有 0.0.1-rc.1，插件要求 ≥0.2.0-rc.1 | 不要装公共版 |
| 正解：复用运行时模块图 | — | 把 DSH 运行时 `@deepseek-ai` 下 287 个包 junction 到临时 `node_modules/@deepseek-ai`，`fetch-external` 自动做 |

**实测结果**：`@yolk_vat-y/dsh-project-memory@0.6.12` 能注册 12 个工具 + `commands: 1` + `skills: 1` + 0 skipped，断言集 8/9（第 9 条是自检用例）。闭环实测耗时：装 16s、probe 1s、断言 1s、清理 1s。

**mock ctx 的边界**：插件若依赖 `llm` / `storage` / `fs` 等服务，相关注册会被跳过，日志里能看到。`llm` 尤其要注意——它是生成式服务，stub 只能返回假文本，测不出真实质量，所以没有伪造；`query_memory` 在 `!llm` 时自己降级（返回原 query），断言集测的正是这条降级路径不会崩。

**删除时必须只删链接本身**：`Remove-Item -Recurse` / `rm -rf` 可能跟进 junction 删掉 DSH 运行时本体。`fetch-external --clean` 用 `unlinkSync` 只摘重解析点，删完核对运行时目录条目数（实测 287 → 287）。

---

## 目录结构

```
dsh-runtime-eval/
  src/
    eval.mjs                 ← 评测器（单文件）
    all.mjs                  ← 跑全部 + 清理临时产物
    scan.mjs                 ← 扫 @local，列出可加载插件
    judge.mjs                ← 判据引擎（11 种）
    adapter.mjs              ← 适配层（apply → tools）+ mock ctx
    leaderboard.mjs          ← 汇总 out/*.json → 静态 HTML 榜单
    probe-external.mjs       ← 探第三方插件能否在 mock ctx 下加载
    fetch-external.mjs       ← 第三方插件：装到 %TEMP% → 补 peer → 清理
  assertions/                ← 本机插件，进 eval:all
    dsh-doc-read-real.json   ← 10 条
    dsh-brief-pack.json      ← 9 条
    dsh-mail-reader.json     ← 9 条（redact：邮件内容不落盘）
    dsh-customs-kb-audit.json ← 7 条
    dsh-record-search.json   ← 7 条
    dsh-mcpack.json          ← 6 条
    dsh-office-qa.json       ← 2 条
    project-dashboard.json   ← 12 条（含 web.fetch fixture）
    mock-doc-read.json       ← 9 条
  assertions-external/       ← 第三方插件，不进 eval:all
    dsh-project-memory.json  ← 8 条（只读工具 + 参数校验）
  fixtures/mock-plugin/      ← 模拟 DSH 插件形式的 mock
  out/                       ← 本机结果 + leaderboard.html（npm run leaderboard）
  out-external/              ← 第三方结果，不混进榜单
```

---

## 下一步

1. **`browser-ops8` 的断言**（14 个工具，但要起真浏览器，要单独设计）
2. **榜单网页**：已完成（`npm run leaderboard` → `out/leaderboard.html`）
3. **加进 CI（每周跑）**

---

## License

MIT
