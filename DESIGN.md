# dsh-runtime-eval · MVP 设计

> 定位：**测「用不用得好」，不是「装不装得上」**
> 一句话：**官方测 L5（进程没死），我测行为（任务对不对）**
> 日期：2026-11-11

---

## 一、为什么做这个

**现状**（来自调研报告的数据）：

| 平台 | 做到哪一级 | 数字 |
|---|---|---|
| dsh.so | L5 运行冒烟 | 25,551 → L4 91% → **L5 只有 15,587 通过** |
| dshmarketplace.dev | install-tested | 索引 17,387，**只测了 5,675** |
| 36kr 实测 | 运行级只测 5 个 | **静态 41 兼容，运行级可用 0/5** |

**空白**：从「能启动」到「能用对」之间是空的。

**我的差异**：**手里有 146 条用例 × 9 轮迭代的方法论**（RAG 评测体系），直接搬过来。

---

## 二、MVP 范围（第一版只做这些）

### 做什么

| # | 能力 | 说明 |
|---|---|---|
| 1 | **断言集格式** | JSON，一个插件一份，10—20 条 |
| 2 | **评测器** | 读断言集 → 调插件的导出函数 → 记通过率 |
| 3 | **结果输出** | `result.json` + `report.md`（人可读）|
| 4 | **1 个真实插件跑通** | 先做 `dsh-doc-read`（有确定性输出）|

### 不做什么（第一版）

| 不做 | 为什么 |
|---|---|
| Web 榜单 | 先把「能跑」做出来 |
| 自动装插件 | 手动装，评测器只负责「测」 |
| 多 host 版本矩阵 | 第一版只测当前版本 |
| UI 插件 | 先做「有确定性输出」的 host 插件 |

---

## 三、断言集格式

```json
{
  "plugin": "dsh-doc-read",
  "repo": "https://github.com/dcd887/dsh-doc-read",
  "testedOn": "DSH 0.2.1-alpha.2",
  "assertions": [
    {
      "id": "outline-counts-pages",
      "task": "对 12 页 PDF 调 doc_outline，应返回 12 页",
      "call": { "fn": "doc_outline", "args": { "path": "fixtures/sample-12p.pdf" } },
      "expect": { "type": "json", "path": "$.pages", "equals": 12 }
    },
    {
      "id": "read-page-range",
      "task": "读第 3-5 页，应只返回 3 页内容",
      "call": { "fn": "doc_read", "args": { "path": "fixtures/sample-12p.pdf", "from": 3, "to": 5 } },
      "expect": { "type": "text", "containsAll": ["第 3 页", "第 5 页"] }
    }
  ]
}
```

**字段**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `plugin` | ✅ | 插件名 |
| `repo` | ✅ | 仓库地址 |
| `testedOn` | ✅ | host 版本 |
| `assertions[].id` | ✅ | 断言 id（唯一）|
| `assertions[].task` | ✅ | 人可读的任务描述 |
| `assertions[].call` | ✅ | 调哪个函数、什么参数 |
| `assertions[].expect` | ✅ | 期望（类型 + 判据）|

---

## 四、评测器怎么跑

**不经过 DSH 的运行时，直接 import 插件导出的函数。**

**为什么**：
- **DSH 的插件「导出」是「纯函数」**（`doc_outline` 等）
- **「直接 import」比「起 DSH 再调工具」快 100 倍**
- **「第一版」先「测「纯函数级」，「工具级」后面加**

**流程**：

```
1. 读 assertions.json
2. import 插件（package.json 的 exports）
3. 逐条跑 call，拿结果
4. 按 expect 判通过/失败
5. 出 result.json + report.md
```

**退出码**：
- `0`：全部通过
- `1`：有失败
- `2`：断言集本身有问题（格式错、插件 import 失败）

---

## 五、第一版要跑的插件

### `dsh-doc-read`

**为什么选它**：
- **输出「确定性」**（页数、行数、匹配数）
- **有「真实 PDF」**（`_selftest/` 里可能有）
- **你自己的插件，改起来方便**

**断言集（10 条，先写 5 条）**：

| # | 断言 | 判据 |
|---|---|---|
| 1 | 12 页 PDF 的 `doc_outline` 应返回 12 页 | `pages == 12` |
| 2 | 读第 3-5 页应只返回 3 页 | 内容含「第 3 页」「第 5 页」，不含「第 6 页」|
| 3 | `doc_grep` 搜一个存在的词，命中数 ≥ 1 | `hits.length >= 1` |
| 4 | `doc_grep` 搜不存在的词，命中数为 0 | `hits.length == 0` |
| 5 | 读超出范围的页，应报错或返回空 | `error` 或 `text == ""` |

---

## 六、文件结构

```
dsh-runtime-eval/
  README.md            ← 对外说明
  DESIGN.md            ← 这份
  package.json
  src/
    eval.mjs           ← 评测器
    judge.mjs          ← 判据引擎（json path / contains / regex）
  assertions/
    dsh-doc-read.json  ← 第一个断言集
  fixtures/
    sample-12p.pdf     ← 测试用 PDF
  out/
    result.json        ← 跑完生成
    report.md
```

---

## 七、验证标准（MVP 通过的条件）

| # | 条件 | 怎么验 |
|---|---|---|
| 1 | 评测器能跑完 1 个插件的 10 条断言 | `node src/eval.mjs assertions/dsh-doc-read.json` |
| 2 | 出 `result.json` + `report.md` | 文件存在、格式对 |
| 3 | 至少 1 条「故意失败」的断言能被判出失败 | 加一条 `equals: 999` 的断言，应 fail |
| 4 | 退出码正确 | 全过 0、有失败 1、格式错 2 |

---

## 八、和报告里「完整版」的差距

**报告里写的是「2000 组合 × 沙盒流水线 × 每周跑」，MVP 只做「单插件 × 10 条断言」。**

**差距**：

| 项 | MVP | 报告完整版 |
|---|---|---|
| 插件数 | 1 | 200+ |
| 断言数 | 10 | 每插件 10—20 |
| 组合 | 无 | 两两组合 ~2000 |
| 自动化 | 手动跑 | CI 每周 |
| 输出 | `result.json` | 公开榜单网页 |

**先做 MVP，能跑通再谈「榜单」。**
