#!/usr/bin/env node
/**
 * 跑全部断言集。
 *
 * 和 package.json 里用 `&&` 串的区别：这里不管前一个是否失败都继续，
 * 最后汇总退出码（有任一失败 = 1）。
 */

import { readdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
// --ext：跑第三方断言集（assertions-external/），结果写 out-external/
const EXT = process.argv.includes('--ext')
const ASSERT_DIR = join(ROOT, EXT ? 'assertions-external' : 'assertions')
const OUT_DIR = join(ROOT, EXT ? 'out-external' : 'out')

const files = readdirSync(ASSERT_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

if (files.length === 0) {
  console.error('[fatal] no assertion files in ' + ASSERT_DIR)
  process.exit(2)
}

const summary = []
for (const file of files) {
  console.log('\n' + '='.repeat(64))
  console.log('  ' + file)
  console.log('='.repeat(64))
  const r = spawnSync(
    process.execPath,
    [join(HERE, 'eval.mjs'), join(ASSERT_DIR, file), '--out', OUT_DIR],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '0' },
    },
  )
  summary.push({ file, code: r.status ?? 2 })
}

console.log('\n' + '='.repeat(64))
console.log('  汇总')
console.log('='.repeat(64))
let worst = 0
for (const s of summary) {
  const tag = s.code === 0 ? 'OK  ' : s.code === 1 ? 'FAIL' : 'ERR '
  if (s.code > worst) worst = s.code
  console.log(`  ${tag}  ${s.file}`)
}
// 清理断言跑出来的临时任务包（brief-pack 的产物）；--ext 模式没有这个产物
if (!EXT) {
  try {
    const briefs = join(ROOT, 'out', 'briefs')
    if (existsSync(briefs)) {
      for (const f of readdirSync(briefs)) rmSync(join(briefs, f), { force: true })
      console.log('  (已清理 out/briefs 的临时任务包)')
    }
  } catch { /* 清理失败不影响结果 */ }
}

console.log('')
process.exit(worst === 0 ? 0 : worst === 1 ? 1 : 2)
