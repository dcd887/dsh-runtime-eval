#!/usr/bin/env node
/**
 * dsh-runtime-eval · 评测器
 *
 * 用法：
 *   node src/eval.mjs assertions/dsh-doc-read.json
 *   node src/eval.mjs assertions/dsh-doc-read.json --plugin ./node_modules/dsh-doc-read
 *
 * 退出码：
 *   0  全部通过
 *   1  有失败
 *   2  断言集或插件有问题（格式错、import 失败）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { judge } from './judge.mjs'
import { loadPlugin, callTool } from './adapter.mjs'

/**
 * 解析插件目录。优先级：--plugin > DSH_EVAL_PLUGIN > 断言集里的 pluginDir。
 *
 * 断言集里不要写死作者机器上的绝对路径，三种写法都支持：
 *   "@local/xxx"      → 相对 DSH 的 @local 目录（默认 ~/.dsh/profiles/web/node_modules/@local，
 *                       可用环境变量 DSH_EVAL_LOCAL 覆盖，换台机器不用改断言集）
 *   "/abs/path"       → 原样使用
 *   "relative/path"   → 相对断言集文件所在目录（不是当前工作目录）
 */
function resolvePluginDir(suite, assertionFile, pluginArg) {
  const raw = pluginArg ?? process.env.DSH_EVAL_PLUGIN ?? suite.pluginDir ?? suite.plugin
  if (!raw) throw new Error('断言集里没有 pluginDir，也没有传 --plugin')

  const text = String(raw).trim()
  if (text.startsWith('@local/') || text.startsWith('@local\\')) {
    const base =
      process.env.DSH_EVAL_LOCAL ??
      join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@local')
    return resolve(base, text.slice('@local/'.length))
  }
  // @ext/：第三方插件临时安装目录（node src/fetch-external.mjs 装到这里）
  if (text.startsWith('@ext/') || text.startsWith('@ext\\')) {
    const base = process.env.DSH_EVAL_EXT ?? join(tmpdir(), 'rt-eval-plugins', 'node_modules')
    return resolve(base, text.slice('@ext/'.length))
  }
  if (isAbsolute(text)) return resolve(text)
  return resolve(dirname(assertionFile), text)
}

/** 在插件目录里找它自带的断言集（assertions/*.json，或根目录下第一个带 assertions 的 json） */
function findAssertionsIn(dir) {
  for (const sub of ['assertions', '']) {
    const d = sub ? join(dir, sub) : dir
    if (!existsSync(d)) continue
    let entries
    try {
      entries = readdirSync(d)
    } catch {
      continue
    }
    for (const f of entries) {
      if (!f.endsWith('.json')) continue
      const p = join(d, f)
      try {
        const j = JSON.parse(readFileSync(p, 'utf8'))
        if (Array.isArray(j.assertions) && j.assertions.length > 0) return p
      } catch { /* 不是断言集，跳过 */ }
    }
  }
  return null
}

/**
 * init：加载插件，把每个注册到的工具生成一条占位断言。
 *
 * 占位 expect 故意写成「必然失败」，这样跑起来一定红，逼着人按真实行为改写，
 * 而不是把自动生成的空断言当成已验证。
 */
async function runInit(pluginDir, outFileArg) {
  const pkgPath = join(pluginDir, 'package.json')
  if (!existsSync(pkgPath)) {
    console.error(`[fatal] 不是插件目录（没有 package.json）：${pluginDir}`)
    process.exit(2)
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

  let loaded
  try {
    loaded = await loadPlugin(pluginDir, {}, {})
  } catch (error) {
    console.error(`[fatal] 加载插件失败，无法列举工具：${error.message}`)
    process.exit(2)
  }
  const tools = [...loaded.tools.keys()]
  const slug = String(pkg.name ?? 'plugin').replace(/[^a-zA-Z0-9._-]/g, '_')
  const TODO = '<TODO: 写一个必然出现在结果里的串>'

  const suite = {
    plugin: pkg.name,
    origin: 'third-party',
    pluginDir: '..',
    testedOn: pkg.dsh?.engines?.dsh ?? '',
    note:
      '由 dsh-runtime-eval init 生成。每条 expect 都是占位（一定失败），请按真实行为改写成有意义的判据。' +
      'pluginDir 为 ".."，表示断言集放在 <插件目录>/assertions/ 下；放在别处请改成绝对路径、@local/xxx，或用 --plugin 传。',
    assertions: [
      ...tools.map((t) => ({
        id: `tool-${String(t).replace(/[^a-zA-Z0-9._-]/g, '-')}`,
        task: `TODO: 描述 ${t} 应该做什么`,
        call: { fn: t, args: {} },
        expect: { jsonPath: '$', containsAll: [TODO] },
      })),
      {
        id: 'DELIBERATE-FAIL',
        task: '故意失败：证明判据引擎真的会判失败，不是永远返回 true',
        call: { fn: tools[0], args: {} },
        expect: { jsonPath: '$', containsAll: ['<DELIBERATE-FAIL: 这个串永远不该出现>'] },
      },
    ],
  }

  const outFile = outFileArg ? resolve(outFileArg) : join(pluginDir, 'assertions', `${slug}.json`)
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(suite, null, 2) + '\n', 'utf8')

  console.log(`已生成 ${outFile}`)
  console.log(`  ${tools.length} 个工具 + 1 条自检 = ${suite.assertions.length} 条断言`)
  console.log('  每条 expect 都是占位（一定失败），改写成真实判据后再跑')
  console.log(`  再跑：dsh-runtime-eval "${pluginDir}"`)
}

const args = process.argv.slice(2)

const USAGE = `用法:
  dsh-runtime-eval <assertions.json> [--plugin <插件目录>] [--out <输出目录>]
  dsh-runtime-eval <插件目录>        用它自带的 assertions/*.json
  dsh-runtime-eval init <插件目录>   生成断言集骨架

  --plugin 覆盖断言集里的 pluginDir；插件目录也可用环境变量 DSH_EVAL_PLUGIN 传。
  pluginDir 写 @local/xxx 表示相对 DSH 的 @local 目录（可用 DSH_EVAL_LOCAL 覆盖）。
`

// 带值的开关要连它后面那一个一起跳过，否则 --plugin 的路径会被当成断言集路径
const FLAGS_WITH_VALUE = new Set(['--plugin', '--out'])
const flags = new Map()
const positional = []
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (FLAGS_WITH_VALUE.has(a)) {
    flags.set(a, args[i + 1])
    i += 1
    continue
  }
  if (a.startsWith('--')) {
    flags.set(a, true)
    continue
  }
  positional.push(a)
}

let pluginArg = typeof flags.get('--plugin') === 'string' ? flags.get('--plugin') : undefined
const outArg = typeof flags.get('--out') === 'string' ? flags.get('--out') : undefined

if (flags.has('--help') || positional.length === 0) {
  console.log(USAGE)
  process.exit(flags.has('--help') ? 0 : 2)
}

// init：从插件目录生成断言集骨架
if (positional[0] === 'init') {
  const target = positional[1]
  if (!target) {
    console.error('init 需要插件目录：dsh-runtime-eval init <插件目录>')
    process.exit(2)
  }
  await runInit(resolve(target), outArg)
  process.exit(0)
}

let assertionPath = positional[0]

// 给的是目录 → 当成插件目录，找它自带的断言集
if (existsSync(assertionPath)) {
  let isDir = false
  try {
    isDir = statSync(assertionPath).isDirectory()
  } catch { /* 忽略 */ }
  if (isDir) {
    const found = findAssertionsIn(assertionPath)
    if (!found) {
      console.error(`[fatal] ${assertionPath} 里没有断言集。先生成骨架：`)
      console.error(`        dsh-runtime-eval init "${assertionPath}"`)
      process.exit(2)
    }
    pluginArg = resolve(assertionPath)
    assertionPath = found
  }
}

let suite
try {
  suite = JSON.parse(readFileSync(assertionPath, 'utf8'))
} catch (error) {
  console.error(`[fatal] cannot read ${assertionPath}: ${error.message}`)
  process.exit(2)
}

const assertions = suite.assertions ?? []
if (!Array.isArray(assertions) || assertions.length === 0) {
  console.error('[fatal] assertions is empty or not an array')
  process.exit(2)
}

// ---- 加载插件（走适配层）----
// 插件导出 apply(ctx, config)，工具在 apply 里通过 ctx.tools.register 注册；
// adapter 造一个假 ctx 把工具收上来，断言集里的 call.fn 就是工具名。

// 断言集里的 ${ROOT} 在运行时替换成项目根（断言集目录的上一级）。
// 这样 fixture 路径既能写成绝对路径喂给插件，又不用把作者机器的路径写进仓库。
const PROJECT_ROOT = resolve(dirname(assertionPath), '..')
function substRoot(value) {
  if (typeof value === 'string') return value.replaceAll('${ROOT}', PROJECT_ROOT)
  if (Array.isArray(value)) return value.map(substRoot)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substRoot(v)]))
  }
  return value
}

let pluginDir
try {
  pluginDir = resolvePluginDir(suite, assertionPath, pluginArg)
} catch (error) {
  console.error(`[fatal] ${error.message}`)
  process.exit(2)
}
let loaded = null
let loadError = null
try {
  loaded = await loadPlugin(pluginDir, substRoot(suite.pluginConfig ?? {}), suite.mock ?? {})
  console.error(`[load] ${loaded.name} ｜tools: ${[...loaded.tools.keys()].join(', ')}`)
} catch (error) {
  loadError = error.message
  console.error(`[fatal] cannot load plugin from ${pluginDir}: ${loadError}`)
  console.error('        路径来自 --plugin / DSH_EVAL_PLUGIN / 断言集 pluginDir；')
  console.error('        别人的插件目录不同时用：node src/eval.mjs <assertions.json> --plugin <dir>')
  if (pluginDir.includes('rt-eval-plugins')) {
    console.error('        第三方插件是临时安装的，先跑：node src/fetch-external.mjs <包名或 git url>')
  }
  process.exit(2)
}

// ---- 逐条跑 ----
const results = []
for (const a of assertions) {
  const started = Date.now()
  let actual
  try {
    const toolName = a.call?.fn
    const value = await callTool(loaded.tools, toolName, substRoot(a.call?.args ?? {}))
    actual = { ok: true, value }
  } catch (error) {
    actual = { ok: false, error: error?.message ?? String(error) }
  }
  const verdict = judge(a, actual)
  results.push({
    id: a.id,
    task: a.task,
    pass: verdict.pass,
    reason: verdict.reason,
    ms: Date.now() - started,
    // redact: 邮件、凭据这类插件的返回值不能落盘（邮件主题/发件人/正文会进 out/*.json）。
    // 只保留判定结果，output 整个不写。
    ...(a.redact
      ? { redacted: true }
      : {
          output:
            actual.ok && typeof actual.value === 'string'
              ? actual.value.slice(0, 200)
              : actual.ok
                ? JSON.stringify(actual.value).slice(0, 200)
                : undefined,
        }),
    error: actual.ok ? undefined : actual.error,
  })
}

// ---- 汇总 ----
const passed = results.filter((r) => r.pass).length
const failed = results.length - passed
const summary = {
  plugin: suite.plugin,
  // 来源：self=自研 / third-party=第三方 / mock=验证评测器自身
  origin: suite.origin ?? (/^mock-/i.test(String(suite.plugin ?? '')) ? 'mock' : 'self'),
  repo: suite.repo,
  testedOn: suite.testedOn,
  ranAt: new Date().toISOString(),
  total: results.length,
  passed,
  failed,
  passRate: Number(((passed / results.length) * 100).toFixed(1)),
  results,
}

// ---- 输出 ----
// --out 用于把「外部插件」的结果写到单独目录，免得混进主榜单的 out/
const outDir = outArg ? resolve(outArg) : resolve(dirname(assertionPath), '..', 'out')
mkdirSync(outDir, { recursive: true })
const slug = (suite.plugin ?? 'plugin').replace(/[^a-zA-Z0-9._-]/g, '_')
writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(summary, null, 2), 'utf8')

const lines = [
  `# ${suite.plugin} · 行为级评测`,
  '',
  `- 仓库：${suite.repo ?? '(未填)'}`,
  `- 测试于：${suite.testedOn ?? '(未填)'}`,
  `- 时间：${summary.ranAt}`,
  `- **结果：${passed}/${results.length} 通过（${summary.passRate}%）**`,
  '',
  '| # | 断言 | 结果 | 耗时 | 说明 |',
  '|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.task ?? r.id} | ${r.pass ? '✅' : '❌'} | ${r.ms} ms | ${escapeCell(r.reason)} |`),
  '',
]
writeFileSync(join(outDir, `${slug}.md`), lines.join('\n'), 'utf8')

// ---- 控制台 ----
for (const [i, r] of results.entries()) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${String(i + 1).padStart(2)}  ${r.id}  (${r.ms} ms)`)
  if (!r.pass) console.log(`      ${r.reason}`)
}
console.log('')
console.log(`${passed}/${results.length} passed (${summary.passRate}%)`)
console.log(`out: ${join(outDir, slug + '.json')}`)
console.log(`     ${join(outDir, slug + '.md')}`)

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

process.exit(failed === 0 ? 0 : 1)
