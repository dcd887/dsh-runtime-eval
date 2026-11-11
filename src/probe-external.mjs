#!/usr/bin/env node
/**
 * 第三方插件探针：对一个 node_modules 目录里的所有 DSH 插件逐个试加载，
 * 报告「能否在 mock ctx 下跑起来、各注册了几个工具」。
 *
 * 和 scan.mjs 的区别：scan 扫本机 @local（都是自己写的），这里扫临时装出来的
 * 第三方包，用于评估「外来插件到底有多少能进评测」。
 *
 * 用法：
 *   node src/probe-external.mjs <node_modules 目录>
 *
 * 只对看起来是 DSH 插件的包动手（package.json 有 dsh 字段 / keywords 含 dsh /
 * 名字含 dsh），其余包记为 skip，不执行其代码。
 */

import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { loadPlugin } from './adapter.mjs'

const root = resolve(process.argv[2] ?? '')
if (!root || !existsSync(root)) {
  console.error('用法: node src/probe-external.mjs <node_modules 目录 | 单个插件目录>')
  process.exit(2)
}

/** node_modules/foo 与 node_modules/@scope/foo 统一成扁平列表 */
function listPackages(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    if (name.startsWith('@')) {
      for (const sub of readdirSync(p)) {
        const q = join(p, sub)
        try {
          if (statSync(q).isDirectory()) out.push({ name: `${name}/${sub}`, dir: q })
        } catch { /* 忽略坏链接 */ }
      }
    } else {
      out.push({ name, dir: p })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function isDshPlugin(dir) {
  const p = join(dir, 'package.json')
  if (!existsSync(p)) return { ok: false, why: '无 package.json' }
  let pkg
  try {
    pkg = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return { ok: false, why: 'package.json 解析失败' }
  }
  const hit =
    Boolean(pkg.dsh) ||
    (Array.isArray(pkg.keywords) && pkg.keywords.some((k) => /dsh|deepseek[-_]harness/i.test(String(k)))) ||
    /dsh/i.test(String(pkg.name ?? ''))
  return hit ? { ok: true, pkg } : { ok: false, why: '不是 DSH 插件' }
}

// 目录本身就是插件（git clone 下来通常是这种）→ 只探它一个；
// 否则当成 node_modules，扫里面的所有包。
const all = existsSync(join(root, 'package.json'))
  ? [{ name: basename(root), dir: root }]
  : listPackages(root)
const results = { loaded: [], noTools: [], failed: [], skipped: [] }

console.log(`目录: ${root}`)
console.log(`包数: ${all.length}\n`)

for (const { name, dir } of all) {
  const gate = isDshPlugin(dir)
  if (!gate.ok) {
    results.skipped.push({ name, why: gate.why })
    continue
  }
  try {
    const loaded = await loadPlugin(dir, {})
    const toolNames = [...loaded.tools.keys()]
    results.loaded.push({
      name,
      pluginName: loaded.name,
      tools: toolNames,
      commands: loaded.commands.length,
      skills: loaded.skills.length,
    })
    console.log(`LOADED   ${name}`)
    console.log(`         pluginName=${loaded.name}  工具 ${toolNames.length} 个: ${toolNames.join(', ')}`)
    if (loaded.commands.length || loaded.skills.length) {
      console.log(`         commands=${loaded.commands.length} skills=${loaded.skills.length}`)
    }
  } catch (error) {
    const msg = String(error?.message ?? error)
    // 「register 了 0 个工具」是一种单独的情况：apply 跑了但没注册工具
    if (/registered no tools/i.test(msg)) {
      results.noTools.push({ name, error: msg })
      console.log(`NO-TOOL  ${name}  (apply 跑了但没注册工具)`)
    } else {
      results.failed.push({ name, error: msg })
      console.log(`FAIL     ${name}`)
      console.log(`         ${msg.slice(0, 160)}`)
    }
  }
}

console.log('\n' + '='.repeat(70))
console.log(`  可加载 ${results.loaded.length} ｜ 无工具 ${results.noTools.length} ｜ 失败 ${results.failed.length} ｜ 跳过 ${results.skipped.length}`)
console.log('='.repeat(70))

if (results.failed.length) {
  console.log('\n失败原因（去重后）：')
  const seen = new Map()
  for (const f of results.failed) {
    const key = f.error.slice(0, 90)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [k, n] of seen) console.log(`  [${n}] ${k}`)
}

const summary = {
  dir: root,
  scannedAt: new Date().toISOString(),
  counts: {
    packages: all.length,
    loaded: results.loaded.length,
    noTools: results.noTools.length,
    failed: results.failed.length,
    skipped: results.skipped.length,
  },
  loaded: results.loaded,
  noTools: results.noTools,
  failed: results.failed.map((f) => ({ name: f.name, error: f.error.slice(0, 300) })),
}
console.log('\n' + JSON.stringify(summary))

process.exit(results.loaded.length > 0 ? 0 : 1)
