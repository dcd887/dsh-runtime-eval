#!/usr/bin/env node
/**
 * 批量探针：扫 @local 下的插件，逐个用适配层加载，列出注册到的工具。
 * 目的：在写断言集之前，先知道「哪些能加载、各自有什么工具」。
 *
 * 用法：node src/scan.mjs
 */

import { readdirSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadPlugin } from './adapter.mjs'

const LOCAL = resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh/profiles/web/node_modules/@local')

if (!existsSync(LOCAL)) {
  console.error('[fatal] @local not found: ' + LOCAL)
  process.exit(2)
}

/** 同一插件的多个版本目录：保留「有入口」且名字里数字最大的那个 */
function dedupe(names) {
  const groups = new Map()
  for (const n of names) {
    // 去掉末尾的数字：browser-ops8 → browser-ops；dsh-doc-read3 → dsh-doc-read
    const base = n.replace(/\d+$/, '') || n
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push(n)
  }
  const keep = []
  for (const [, members] of groups) {
    const usable = members.filter((m) => {
      const p = join(LOCAL, m)
      try {
        const lst = lstatSync(p)
        if (lst.isSymbolicLink()) realpathSync(p)
      } catch {
        return false
      }
      return existsSync(join(p, 'index.js')) || existsSync(join(p, 'entry.js'))
    })
    if (usable.length === 0) continue
    // 数字大的优先（browser-ops8 > browser-ops），无数字的排最后
    usable.sort((a, b) => {
      const na = Number(a.match(/(\d+)$/)?.[1] ?? -1)
      const nb = Number(b.match(/(\d+)$/)?.[1] ?? -1)
      return nb - na
    })
    keep.push(usable[0])
  }
  return keep.sort()
}

// @local 下大多是 npm link 出来的 junction。坏掉的 junction（指向已删除的目录）会让
// statSync 抛 ENOENT，所以先用 lstat 判断是不是链接，再用 realpathSync 验证链接目标是否还在。
const all = readdirSync(LOCAL).filter((n) => {
  const p = join(LOCAL, n)
  try {
    const lst = lstatSync(p)
    if (lst.isSymbolicLink()) {
      try {
        realpathSync(p)
        return true
      } catch {
        return false // 悬空链接
      }
    }
    return lst.isDirectory()
  } catch {
    return false
  }
})

const targets = dedupe(all)
console.log(`@local: ${all.length} 个目录 → 去重后 ${targets.length} 个插件\n`)

const ok = []
const failed = []

for (const name of targets) {
  const dir = join(LOCAL, name)
  try {
    const { name: pluginName, tools } = await loadPlugin(dir, {})
    const toolNames = [...tools.keys()]
    ok.push({ dir: name, pluginName, tools: toolNames })
    console.log(`OK    ${name.padEnd(28)} → ${pluginName.padEnd(24)} ${toolNames.length} 个工具`)
    console.log(`      ${toolNames.join(', ')}`)
  } catch (error) {
    failed.push({ dir: name, error: error.message })
    console.log(`FAIL  ${name.padEnd(28)} → ${error.message.slice(0, 110)}`)
  }
}

console.log('\n' + '='.repeat(64))
console.log(`  可加载：${ok.length} ｜失败：${failed.length}`)
console.log('='.repeat(64))
for (const f of failed) console.log(`  ${f.dir}: ${f.error.slice(0, 120)}`)

process.exit(ok.length === 0 ? 2 : 0)
