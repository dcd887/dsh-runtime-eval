#!/usr/bin/env node
/**
 * 第三方插件的「临时安装 → 测 → 删除」闭环。
 *
 *   node src/fetch-external.mjs <npm 包名...>              # 装到 %TEMP%\rt-eval-plugins 并补 peer 模块
 *   node src/fetch-external.mjs <git url...>               # git clone 一个仓库到同一处
 *   node src/fetch-external.mjs --clean                    # 安全清理（只删链接，不碰 DSH 运行时）
 *   node src/fetch-external.mjs --status                   # 看当前装了什么
 *
 * 为什么需要补 peer 模块：第三方插件把 @deepseek-ai/* 声明成 optional
 * peerDependencies，npm 不会装；公共 npm 上的 dsh-tools 又只有 0.0.1-rc.1
 * （插件普遍要求 ≥0.2.0-rc.1）。正确做法是把本机 DSH 运行时的模块图
 * junction 进临时目录。
 *
 * 清理必须只删链接本身：rm -rf / Remove-Item -Recurse 可能跟进 junction
 * 删掉 DSH 运行时本体。这里用 unlinkSync（只摘重解析点），删完还要核对
 * 运行时目录的条目数没变。
 */

import { existsSync, readdirSync, statSync, lstatSync, mkdirSync, rmSync, unlinkSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const TMP = join(tmpdir(), 'rt-eval-plugins')
const MODULES = join(TMP, 'node_modules')
const AI_DIR = join(MODULES, '@deepseek-ai')

/** 找本机 DSH 运行时的 @deepseek-ai 目录（bases 下可能有多份，取最新的） */
function findDshModules() {
  const env = process.env.DSH_RUNTIME_MODULES
  if (env && existsSync(env)) return env

  const bases = join(process.env.LOCALAPPDATA ?? '', 'DoubaoWork', 'User Data', 'sandbox_runtime', 'bases')
  if (!existsSync(bases)) return null

  const found = []
  for (const base of readdirSync(bases)) {
    const p = join(bases, base, 'node', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai')
    if (!existsSync(p)) continue
    try {
      found.push({ p, mtime: statSync(join(bases, base)).mtimeMs })
    } catch { /* 跳过读不到的 */ }
  }
  found.sort((a, b) => b.mtime - a.mtime)
  return found.length ? found[0].p : null
}

function countDshModules(dshAi) {
  try {
    return readdirSync(dshAi).length
  } catch {
    return -1
  }
}

/** npm install 到临时目录（跳过着色脚本，避免第三方 postinstall 乱跑） */
function npmInstall(packages) {
  mkdirSync(TMP, { recursive: true })

  // Windows 上 npm 是 .cmd（批处理），必须走 shell；但「args 数组 + shell」会触发
  // DEP0190（Node 认为参数未经转义）。所以先校验包名，再拼成单条命令。
  const SAFE = /^[@a-zA-Z0-9._/-]+$/
  for (const p of packages) {
    if (!SAFE.test(p)) {
      console.error(`[fatal] 非法包名: ${p}`)
      process.exit(2)
    }
  }
  const quoted = packages.map((p) => `"${p}"`).join(' ')
  const cmd = `npm install ${quoted} --prefix "${TMP}" --ignore-scripts --omit=dev --no-audit --no-fund`
  console.log(`npm: ${packages.join(', ')}`)
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true, cwd: TMP })
  if (r.status !== 0) {
    console.error(`[fatal] npm install 退出码 ${r.status}`)
    process.exit(2)
  }
}

/** git clone 一个仓库到 node_modules/_git_<repo>，这样它能向上解析到 @deepseek-ai */
function gitClone(urls) {
  mkdirSync(MODULES, { recursive: true })
  const failed = []
  for (const url of urls) {
    const repo = url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? 'repo'
    const dest = join(MODULES, `_git_${repo}`)
    if (existsSync(dest)) {
      console.log(`已存在，跳过：${repo}`)
      continue
    }
    console.log(`git clone ${url}`)
    // 不走 shell：URL 作为独立参数，没有注入面
    const r = spawnSync('git', ['clone', '--depth', '1', url, dest], { stdio: 'inherit' })
    if (r.status !== 0) {
      // 索引里相当比例的仓库已经删了/改名了，单个失败不该中止整批
      console.error(`  [skip] clone 失败（退出码 ${r.status}），跳过这个`)
      failed.push(url)
      continue
    }
    console.log(`  -> ${dest}`)
  }
  if (failed.length) {
    console.log(`\n跳过 ${failed.length}/${urls.length} 个（仓库不存在或不可访问）`)
  }
}

/** 把 DSH 运行时的 @deepseek-ai 模块图 junction 进临时目录 */
function linkRuntime() {
  const dshAi = findDshModules()
  if (!dshAi) {
    console.error('[fatal] 找不到本机 DSH 运行时的 @deepseek-ai 目录。')
    console.error('        可设环境变量 DSH_RUNTIME_MODULES 指向它。')
    process.exit(2)
  }
  console.log(`补 peer 模块 ← ${dshAi}`)
  mkdirSync(AI_DIR, { recursive: true })

  let linked = 0
  for (const name of readdirSync(dshAi)) {
    const target = join(AI_DIR, name)
    if (existsSync(target)) continue
    try {
      symlinkSync(join(dshAi, name), target, 'junction')
      linked += 1
    } catch { /* 单个失败不影响其它 */ }
  }
  console.log(`junction ${linked} 个（@deepseek-ai 现有 ${readdirSync(AI_DIR).length} 项）`)
}

function clean() {
  const dshAi = findDshModules()
  if (!dshAi) {
    console.error('[fatal] 找不到 DSH 运行时，拒绝清理（没法核对目标是否完好）')
    process.exit(2)
  }
  const before = countDshModules(dshAi)

  // 1) 先摘 junction（只删链接本身，不递归、不跟进）
  let removed = 0
  if (existsSync(AI_DIR)) {
    for (const name of readdirSync(AI_DIR)) {
      const p = join(AI_DIR, name)
      try {
        if (lstatSync(p).isSymbolicLink()) {
          unlinkSync(p)
          removed += 1
        }
      } catch { /* 非链接的跳过，交给下一步整目录删 */ }
    }
  }
  console.log(`摘除 junction: ${removed}`)

  const mid = countDshModules(dshAi)
  if (mid !== before) {
    console.error(`[fatal] DSH 运行时条目数 ${before} -> ${mid}，拒绝继续删除`)
    process.exit(2)
  }

  // 2) 再删临时目录
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true })
    console.log(`已删除 ${TMP}`)
  } else {
    console.log('临时目录本来就不存在')
  }

  const after = countDshModules(dshAi)
  console.log(`DSH 运行时模块数: ${before} -> ${after}`)
  if (after !== before) {
    console.error('[fatal] 运行时模块数变化，请人工检查')
    process.exit(2)
  }
  console.log('清理完成，运行时完好')
}

function status() {
  if (!existsSync(MODULES)) {
    console.log('临时目录为空（先运行 node src/fetch-external.mjs <包名或 git url>）')
    return
  }
  console.log(`目录: ${MODULES}`)
  const items = []
  for (const name of readdirSync(MODULES)) {
    if (name.startsWith('.')) continue
    const p = join(MODULES, name)
    try {
      if (!statSync(p).isDirectory()) continue
    } catch {
      continue
    }
    if (name.startsWith('@')) {
      if (name === '@deepseek-ai') continue
      for (const sub of readdirSync(p)) items.push(`${name}/${sub}`)
    } else {
      items.push(name)
    }
  }
  if (items.length === 0) console.log('  （没有装插件）')
  for (const s of items) console.log(`  ${s}`)
}

function report() {
  console.log('')
  console.log('下一步：')
  console.log('  node src/probe-external.mjs "%TEMP%/rt-eval-plugins/node_modules/<scope 或 _git_xxx>"')
  console.log('  # npm 装的：npm run eval:ext')
  console.log('  # git 装的：node src/eval.mjs init "<上面那个目录>" 然后 node src/eval.mjs "<目录>"')
  console.log('  测完立刻清理：node src/fetch-external.mjs --clean')
}

const argv = process.argv.slice(2)
if (argv.includes('--clean')) {
  clean()
} else if (argv.includes('--status')) {
  status()
} else if (argv.length === 0) {
  console.error('用法: node src/fetch-external.mjs <npm 包名|git url...> | --clean | --status')
  process.exit(2)
} else {
  const items = argv.filter((a) => !a.startsWith('--'))
  const gitUrls = items.filter((a) => /^https?:\/\//.test(a))
  const npmPkgs = items.filter((a) => !/^https?:\/\//.test(a))
  if (npmPkgs.length) npmInstall(npmPkgs)
  if (gitUrls.length) gitClone(gitUrls)
  linkRuntime()
  report()
}
