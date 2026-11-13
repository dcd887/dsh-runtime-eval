#!/usr/bin/env node
/**
 * dsh-plugin-check · DSH 插件体检
 *
 * 设计目标：让**没写过插件的人**看完就知道这个插件能不能用、为什么、怎么修。
 * 所以每条问题都带三段：发生了什么 / 后果 / 怎么修。
 *
 * 用法：
 *   npx dsh-plugin-check <插件目录>
 *   npx dsh-plugin-check <插件目录> --json
 *   npx dsh-plugin-check <插件目录> --config ./config.json
 *
 * 退出码：
 *   0  没有 error（可能有 warn）
 *   1  有 error
 *   2  用法错误或目录不存在
 */

import { resolve } from 'node:path'
import { readFileSync, existsSync, lstatSync, readlinkSync } from 'node:fs'
import { loadPlugin } from './adapter.mjs'

const on = process.stdout.isTTY
const C = {
  g: on ? '\x1b[32m' : '',
  y: on ? '\x1b[33m' : '',
  r: on ? '\x1b[31m' : '',
  d: on ? '\x1b[2m' : '',
  b: on ? '\x1b[1m' : '',
  n: on ? '\x1b[0m' : '',
}

const USAGE = `${C.d}dsh-plugin-check · 检查一个 DSH 插件能不能用

用法
  dsh-plugin-check <插件目录> [选项]

选项
  --json              输出 JSON（给 CI 用）
  --config <file>     把 JSON 配置传给插件的 apply
  --help              显示这段帮助

退出码
  0 没问题    1 有问题    2 用法错误${C.n}`

function die(msg) {
  console.error(`${C.r}${msg}${C.n}`)
  process.exit(2)
}

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** 一条问题：发生了什么 / 后果 / 怎么修 */
const issue = (level, code, what, impact, fix, tool) => ({ level, code, what, impact, fix, tool })

/** 单个工具的静态检查 */
function inspectTool(tool) {
  const out = []
  const name = tool?.name
  if (!name || typeof name !== 'string') {
    out.push(
      issue('ERROR', 'tool-no-name', '有一个工具没有 name', 'DSH 无法注册它，模型也调不到它', '给 tools.register 的对象加 name 字段'),
    )
    return out
  }

  if (typeof tool.execute !== 'function') {
    out.push(
      issue('ERROR', 'tool-no-execute', `工具 ${name} 没有 execute 函数`, '它会被列在工具表里，但一调用就崩', '补上 execute(args) 的实现', name),
    )
  }

  const desc = tool.description
  if (!desc || String(desc).trim() === '') {
    out.push(
      issue(
        'WARN',
        'tool-no-description',
        `工具 ${name} 没有 description`,
        '模型选工具时只看得到 name 和 description。没描述，它基本不会被选中——工具等于白注册',
        '加一句「什么时候用它、它返回什么」，比如 "Read a page range from a PDF and return its text"',
        name,
      ),
    )
  } else if (String(desc).trim().length < 15) {
    out.push(
      issue(
        'WARN',
        'tool-short-description',
        `工具 ${name} 的 description 只有 ${String(desc).trim().length} 个字`,
        '太短了，模型很难判断该在什么场景用它',
        '写清输入是什么、输出是什么',
        name,
      ),
    )
  }

  const params = tool.parameters
  if (params !== undefined && (typeof params !== 'object' || Array.isArray(params))) {
    out.push(
      issue('ERROR', 'tool-bad-parameters', `工具 ${name} 的 parameters 不是对象`, '模型按 JSON Schema 传参，schema 不合法会导致调用失败', '把 parameters 写成 { type: "object", properties: {...} }', name),
    )
  } else if (params && typeof params === 'object') {
    if (params.type && params.type !== 'object') {
      out.push(
        issue('WARN', 'tool-parameters-type', `工具 ${name} 的 parameters.type 是 "${params.type}"`, '工具参数通常是 object；类型不对会让模型传错形状', '改成 "object"', name),
      )
    }
    if (params.type === 'object' && Array.isArray(params.required)) {
      for (const key of params.required) {
        if (!params.properties?.[key]) {
          out.push(
            issue(
              'ERROR',
              'tool-required-unknown',
              `工具 ${name} 把 "${key}" 列进了 required，但 properties 里没有这个字段`,
              '模型调用时一定过不了参数校验，这个工具永远调不通',
              `要么在 properties 里补 "${key}"，要么把它从 required 里删掉`,
              name,
            ),
          )
        }
      }
    }
  }

  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    out.push(
      issue('WARN', 'tool-name-style', `工具名 "${name}" 不是小写加下划线`, '不影响运行，但模型在多个工具之间选择时，命名风格不统一会增加误选', '改成小写 + 下划线，如 doc_read', name),
    )
  }

  return out
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(USAGE)
    process.exit(argv.length === 0 ? 2 : 0)
  }

  let jsonOut = false
  let config = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') { jsonOut = true; continue }
    if (a === '--config') {
      const f = argv[++i]
      if (!f) die('--config 后面要跟一个 JSON 文件')
      try { config = JSON.parse(readFileSync(f, 'utf8')) } catch (e) { die(`读不了 config：${e.message}`) }
      continue
    }
    if (a.startsWith('-')) die(`不认识的选项：${a}`)
    positional.push(a)
  }
  if (positional.length === 0) die('缺插件目录。用法：dsh-plugin-check <插件目录>')

  const pluginDir = resolve(positional[0])

  /* ---------- 目录级：先说清楚「装没装上」 ---------- */
  if (!existsSync(pluginDir)) {
    let linkTarget = null
    try {
      if (lstatSync(pluginDir).isSymbolicLink()) linkTarget = readlinkSync(pluginDir)
    } catch { /* 路径真的不存在 */ }

    if (linkTarget) {
      const report = {
        plugin: { dir: pluginDir, name: null, version: null, description: null },
        verdict: 'unusable',
        registered: { tools: [], commands: [], skills: [], routes: 0 },
        issues: [
          issue(
            'ERROR',
            'broken-link',
            `这是一个快捷方式（junction），但它指向的目录不存在：\n            ${linkTarget}`,
            'DSH 加载时会直接跳过它，而且不报错。你会以为装好了，实际一个工具都没有',
            '把插件放到新位置后重建链接（mklink /J），或者干脆把目录拷进 node_modules，不用链接',
          ),
        ],
        summary: { errors: 1, warnings: 0 },
      }
      if (jsonOut) { console.log(JSON.stringify(report, null, 2)); process.exit(1) }
      renderHeader(report)
      renderVerdict(report)
      renderIssues(report.issues)
      renderNext(report, 1, 0)
      process.exit(1)
    }
    die(`目录不存在：${pluginDir}`)
  }

  /* ---------- 加载 ---------- */
  const issues = []
  let loaded = null
  try {
    loaded = await loadPlugin(pluginDir, config, {})
  } catch (e) {
    const msg = String(e?.message ?? e)
    const isEntry = msg.includes('入口文件不存在')
    issues.push(
      issue(
        'ERROR',
        isEntry ? 'entry-missing' : 'load-failed',
        isEntry ? msg.split('\n')[0] : `插件加载失败：${msg.split('\n')[0]}`,
        '这个插件永远不会被 DSH 加载，装了等于没装',
        isEntry
          ? '先 build 出入口文件，或把 build 产物一起提交；确认 package.json 的 main / exports 指向真实存在的文件'
          : '按上面的报错修；常见原因是依赖没装（先 npm install）、语法错误、或入口路径不对',
      ),
    )
  }

  /* ---------- 注册面 ---------- */
  const tools = loaded ? [...loaded.tools.values()] : []
  if (loaded) {
    for (const t of tools) issues.push(...inspectTool(t))

    for (const log of loaded.logs ?? []) {
      if (String(log?.level).toLowerCase() === 'error') {
        issues.push(
          issue(
            'WARN',
            'error-logged',
            `apply 期间打了 error 日志：${clip(log.msg ?? log.message ?? '', 140)}`,
            '有些插件出错不抛异常、只打日志。表面上一切正常，实际某个功能已经失效',
            '看这条日志指向哪一步，补齐依赖或修掉那个分支',
          ),
        )
      }
    }

    const surfaces = (loaded.tools?.size ?? 0) + (loaded.commands?.length ?? 0) + (loaded.skills?.length ?? 0) + (loaded.routes?.length ?? 0)
    if (surfaces === 0) {
      issues.push(
        issue(
          'ERROR',
          'nothing-registered',
          '加载成功了，但它什么都没注册（没有工具、命令、skill、路由）',
          'DSH 里看不到任何新功能。这是「装上了」和「能用」之间最常见的一道坎',
          '如果是纯 UI 插件，这条可以忽略；否则检查 apply 里的条件分支——通常是它依赖的服务（如 ctx.web.fetch）不在环境里，注册被静默跳过',
        ),
      )
    }
  }

  const errors = issues.filter((i) => i.level === 'ERROR')
  const warns = issues.filter((i) => i.level === 'WARN')

  const report = {
    plugin: {
      dir: pluginDir,
      name: loaded?.name ?? null,
      version: loaded?.pkg?.version ?? null,
      description: loaded?.pkg?.description ?? null,
      entry: loaded?.entry ?? null,
    },
    verdict: errors.length ? 'unusable' : warns.length ? 'usable-with-warnings' : 'usable',
    registered: {
      tools: tools.map((t) => ({ name: t.name, description: clip(t.description ?? '', 76) })),
      commands: (loaded?.commands ?? []).map((c) => c?.name).filter(Boolean),
      skills: (loaded?.skills ?? []).map((s) => s?.name).filter(Boolean),
      routes: (loaded?.routes ?? []).length,
    },
    issues,
    summary: { errors: errors.length, warnings: warns.length },
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(errors.length ? 1 : 0)
  }

  renderHeader(report)
  renderVerdict(report)
  renderTools(report)
  renderChecks(report)
  renderIssues(issues)
  renderNext(report, errors.length, warns.length)

  process.exit(errors.length ? 1 : 0)
}

/* ------------------------------ 渲染 ------------------------------ */

function renderHeader(r) {
  const name = r.plugin.name ?? '（读不到名字）'
  console.log('')
  console.log(`  ${C.b}${name}${C.n}${r.plugin.version ? `  ${C.d}${r.plugin.version}${C.n}` : ''}`)
  if (r.plugin.description) console.log(`  ${C.d}${clip(r.plugin.description, 100)}${C.n}`)
  console.log(`  ${C.d}${r.plugin.dir}${C.n}`)
  console.log('')
}

function renderVerdict(r) {
  if (r.verdict === 'usable') {
    console.log(`  ${C.g}✓ 可以用${C.n}  ${C.d}加载正常，注册了 ${r.registered.tools.length} 个工具${C.n}`)
  } else if (r.verdict === 'usable-with-warnings') {
    console.log(`  ${C.y}! 能用，但有 ${r.summary.warnings} 处可以改进${C.n}`)
  } else {
    console.log(`  ${C.r}✗ 不能用${C.n}`)
  }
  console.log('')
}

function renderTools(r) {
  const { tools } = r.registered
  if (!tools.length) return
  console.log(`  ${C.d}它能做什么${C.n}`)
  const width = Math.min(22, Math.max(...tools.map((t) => t.name.length)) + 2)
  for (const t of tools) {
    console.log(`    ${C.b}${t.name.padEnd(width)}${C.n}${C.d}${t.description || '（没有描述，模型基本不会选它）'}${C.n}`)
  }
  const extra = []
  if (r.registered.commands.length) extra.push(`${r.registered.commands.length} 个命令`)
  if (r.registered.skills.length) extra.push(`${r.registered.skills.length} 个 skill`)
  if (r.registered.routes) extra.push(`${r.registered.routes} 条路由`)
  if (extra.length) console.log(`    ${C.d}另外注册了 ${extra.join('、')}${C.n}`)
  console.log('')
}

function renderChecks(r) {
  const e = r.summary.errors
  const w = r.summary.warnings
  const loaded = Boolean(r.plugin.entry) && Boolean(r.plugin.name)
  console.log(`  ${C.d}检查${C.n}`)
  const line = (ok, text) => console.log(`    ${ok ? `${C.g}✓${C.n}` : `${C.r}✗${C.n}`} ${text}`)
  line(Boolean(r.plugin.entry), r.plugin.entry ? '能 import，入口文件存在' : '入口文件不存在，插件加载不了')
  line(loaded, loaded ? 'apply 执行完没有抛错' : 'apply 没能执行')
  line(r.registered.tools.length > 0, `注册了 ${r.registered.tools.length} 个工具`)
  line(e === 0, e === 0 ? '没有阻断性问题' : `${e} 个会直接影响使用的问题`)
  if (w > 0) console.log(`    ${C.y}!${C.n} ${w} 处可以改进的写法（不阻断使用）`)
  else console.log(`    ${C.g}✓${C.n} 没有需要注意的写法`)
  console.log('')
}

function renderIssues(issues) {
  if (!issues.length) return
  issues.forEach((i, idx) => {
    const isErr = i.level === 'ERROR'
    const head = isErr ? `${C.r}${idx + 1}. ${i.what}${C.n}` : `${C.y}${idx + 1}. ${i.what}${C.n}`
    console.log(`  ${head}`)
    if (i.impact) console.log(`     ${C.d}后果${C.n}  ${i.impact}`)
    if (i.fix) console.log(`     ${C.d}怎么修${C.n}  ${i.fix}`)
    console.log('')
  })
}

function renderNext(r, errors, warns) {
  if (errors) {
    console.log(`  ${C.d}修完上面 ${errors} 条再看一次：${C.n}dsh-plugin-check ${r.plugin.dir}`)
  } else if (warns) {
    console.log(`  ${C.d}这些是建议，不影响使用。想让插件更容易被模型选中，按「怎么修」改一遍。${C.n}`)
  } else {
    console.log(`  ${C.d}装进 DSH 就能用。想验证它做出来的东西对不对，用 dsh-runtime-eval 跑断言集。${C.n}`)
  }
  console.log('')
}

function errorsWord(n) {
  return `${n} 个问题`
}

function renderFooter(report, note) {
  console.log(`  ${C.d}${note}${C.n}`)
  console.log('')
}

main().catch((e) => {
  console.error(`${C.r}未捕获错误${C.n}：${e?.stack ?? e}`)
  process.exit(2)
})
