#!/usr/bin/env node
/**
 * dsh-plugin-check · DSH 插件体检
 *
 * 不需要写断言集，直接对任意插件目录做一次基础检查：
 *   1. 能否 import、apply 会不会抛错
 *   2. 注册了什么（工具 / 命令 / skill / 路由）
 *   3. 每个工具的 name / description / parameters 是否完整
 *   4. apply 期间有没有打 error 日志
 *   5. 加载成功但什么都没注册（最常见的「装了等于没装」）
 *
 * 用法：
 *   npx dsh-plugin-check <插件目录>
 *   npx dsh-plugin-check <插件目录> --json
 *   npx dsh-plugin-check <插件目录> --config ./config.json
 *
 * 退出码：
 *   0  没有 ERROR（可能有 WARN）
 *   1  有 ERROR
 *   2  用法错误或插件目录不存在
 */

import { resolve } from 'node:path'
import { readFileSync, existsSync, lstatSync, readlinkSync } from 'node:fs'
import { loadPlugin } from './adapter.mjs'

const GREEN = process.stdout.isTTY ? '\x1b[32m' : ''
const YELLOW = process.stdout.isTTY ? '\x1b[33m' : ''
const RED = process.stdout.isTTY ? '\x1b[31m' : ''
const DIM = process.stdout.isTTY ? '\x1b[2m' : ''
const RESET = process.stdout.isTTY ? '\x1b[0m' : ''

const USAGE = `${DIM}dsh-plugin-check · DSH 插件体检

用法：
  dsh-plugin-check <插件目录> [选项]

选项：
  --json              以 JSON 输出（适合 CI 或后续处理）
  --config <file>     传给插件的 config（JSON 文件）
  --help              显示这段帮助

退出码：
  0  没有 ERROR      1  有 ERROR      2  用法错误`

function fail(msg) {
  console.error(`${RED}${msg}${RESET}`)
  process.exit(2)
}

/** 工具的静态检查：返回 issue 列表 */
function inspectTool(tool) {
  const issues = []
  const name = tool?.name

  if (!name || typeof name !== 'string') {
    issues.push({ level: 'ERROR', code: 'tool-no-name', detail: '工具没有 name' })
    return issues
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    issues.push({
      level: 'WARN',
      code: 'tool-name-style',
      tool: name,
      detail: `工具名 "${name}" 不是小写+下划线；模型按名字选工具，风格不统一会增加误选`,
    })
  }
  const desc = tool.description
  if (!desc || String(desc).trim() === '') {
    issues.push({
      level: 'WARN',
      code: 'tool-no-description',
      tool: name,
      detail: '没有 description；模型只看得到 name 和 description，缺了它基本不会被选中',
    })
  } else if (String(desc).length < 15) {
    issues.push({
      level: 'WARN',
      code: 'tool-short-description',
      tool: name,
      detail: `description 只有 ${String(desc).length} 字，可能不足以让模型判断何时使用`,
    })
  }
  const params = tool.parameters
  if (params !== undefined && (typeof params !== 'object' || Array.isArray(params))) {
    issues.push({
      level: 'ERROR',
      code: 'tool-bad-parameters',
      tool: name,
      detail: 'parameters 不是对象；应当是 JSON Schema',
    })
  }
  if (params && typeof params === 'object') {
    if (params.type && params.type !== 'object') {
      issues.push({
        level: 'WARN',
        code: 'tool-parameters-type',
        tool: name,
        detail: `parameters.type 是 "${params.type}"，工具参数通常是 "object"`,
      })
    }
    if (params.type === 'object' && params.properties) {
      const required = Array.isArray(params.required) ? params.required : []
      for (const key of required) {
        if (!params.properties[key]) {
          issues.push({
            level: 'ERROR',
            code: 'tool-required-unknown',
            tool: name,
            detail: `required 里有 "${key}"，但 properties 里没有这个字段`,
          })
        }
      }
    }
  }
  if (typeof tool.execute !== 'function') {
    issues.push({
      level: 'ERROR',
      code: 'tool-no-execute',
      tool: name,
      detail: '没有 execute 函数，调用了会崩',
    })
  }
  return issues
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
    if (a === '--json') {
      jsonOut = true
      continue
    }
    if (a === '--config') {
      const f = argv[++i]
      if (!f) fail('--config 后面要跟一个 JSON 文件')
      try {
        config = JSON.parse(readFileSync(f, 'utf8'))
      } catch (e) {
        fail(`读不了 config：${e.message}`)
      }
      continue
    }
    if (a.startsWith('-')) fail(`不认识的选项：${a}`)
    positional.push(a)
  }

  if (positional.length === 0) fail('缺插件目录。用法：dsh-plugin-check <插件目录>')
  const pluginDir = resolve(positional[0])
  if (!existsSync(pluginDir)) {
    // existsSync 会跟随链接：目标不存在的 junction 也返回 false。
    // 这两种情况对插件安装来说是同一个后果，但原因不同，分开报。
    let isLink = false
    let target = null
    try {
      const st = lstatSync(pluginDir)
      isLink = st.isSymbolicLink()
      if (isLink) target = readlinkSync(pluginDir)
    } catch {
      /* 路径真的不存在 */
    }
    if (isLink) {
      fail(
        `这是一个链接，但链接目标不存在：\n  链接  ${pluginDir}\n  指向  ${target}\n` +
          `DSH 会静默跳过这种插件——看起来装了，实际不生效。修法：重建链接，或直接放进 node_modules。`,
      )
    }
    fail(`目录不存在：${pluginDir}`)
  }

  const issues = []
  let loaded = null

  try {
    loaded = await loadPlugin(pluginDir, config, {})
  } catch (e) {
    issues.push({
      level: 'ERROR',
      code: 'load-failed',
      detail: `插件加载失败：${e.message}`,
    })
  }

  if (loaded) {
    const tools = [...loaded.tools.values()]
    for (const t of tools) issues.push(...inspectTool(t))

    // apply 期间的 error 日志
    for (const entry of loaded.logs ?? []) {
      if (String(entry?.level).toLowerCase() === 'error') {
        issues.push({
          level: 'WARN',
          code: 'error-logged',
          detail: `apply 期间打了 error：${String(entry.msg ?? entry.message ?? '').slice(0, 160)}`,
        })
      }
    }

    const surfaces =
      (loaded.tools?.size ?? 0) +
      (loaded.commands?.length ?? 0) +
      (loaded.skills?.length ?? 0) +
      (loaded.routes?.length ?? 0)
    if (surfaces === 0) {
      issues.push({
        level: 'ERROR',
        code: 'nothing-registered',
        detail:
          '加载成功但什么都没注册（没有工具、命令、skill、路由）。常见原因：' +
          '依赖的服务不在 mock ctx 里、apply 里有条件分支没走到、或者这是个纯 UI 插件',
      })
    }
  }

  const errors = issues.filter((i) => i.level === 'ERROR')
  const warns = issues.filter((i) => i.level === 'WARN')

  const report = {
    plugin: {
      dir: pluginDir,
      name: loaded?.name ?? null,
      pkg: loaded?.pkg?.name ?? null,
      version: loaded?.pkg?.version ?? null,
      entry: loaded?.entry ?? null,
    },
    registered: {
      tools: loaded ? [...loaded.tools.keys()] : [],
      commands: (loaded?.commands ?? []).map((c) => c?.name),
      skills: (loaded?.skills ?? []).map((s) => s?.name),
      routes: (loaded?.routes ?? []).length,
    },
    issues,
    summary: { errors: errors.length, warnings: warns.length },
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(errors.length > 0 ? 1 : 0)
  }

  // 人类可读
  console.log('')
  console.log(`${DIM}插件${RESET}  ${report.plugin.name ?? '(未知)'}  ${DIM}${report.plugin.version ?? ''}${RESET}`)
  console.log(`${DIM}目录${RESET}  ${pluginDir}`)
  console.log('')
  console.log(
    `${DIM}注册${RESET}  工具 ${report.registered.tools.length} ｜ 命令 ${report.registered.commands.length} ｜ skill ${report.registered.skills.length} ｜ 路由 ${report.registered.routes}`,
  )
  if (report.registered.tools.length) {
    console.log(`${DIM}     ${RESET}${report.registered.tools.join(', ')}`)
  }
  console.log('')

  if (issues.length === 0) {
    console.log(`${GREEN}✓ 没有发现问题${RESET}`)
  } else {
    for (const i of issues) {
      const mark = i.level === 'ERROR' ? `${RED}✗ ERROR${RESET}` : `${YELLOW}! WARN ${RESET}`
      const where = i.tool ? ` [${i.tool}]` : ''
      console.log(`${mark}${where}  ${i.code}`)
      console.log(`         ${i.detail}`)
    }
    console.log('')
  }

  console.log(
    `${DIM}合计${RESET}  ${errors.length ? RED : ''}${errors.length} error${RESET} ｜ ${warns.length ? YELLOW : ''}${warns.length} warning${RESET}`,
  )
  if (errors.length === 0 && warns.length > 0) {
    console.log(`${DIM}WARN 不影响退出码；想一次跑真实任务断言，用 dsh-runtime-eval <断言集>${RESET}`)
  }
  console.log('')

  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(`${RED}未捕获错误${RESET}：${e?.stack ?? e}`)
  process.exit(2)
})
