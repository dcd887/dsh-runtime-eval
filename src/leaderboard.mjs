#!/usr/bin/env node
/**
 * 把 out/*.json 汇总成一张静态 HTML 榜单 + 一份汇总 JSON。
 *
 * 两个口径（都从数据算，不手填）：
 *   - 有效通过率：剔除 DELIBERATE-FAIL 自检用例后的真实通过率
 *   - 原始通过率：含自检用例，即 eval:all 会看到的数字
 *
 * 自检用例的识别依据是 id 含 DELIBERATE（见 README「每个断言集都含一条
 * DELIBERATE-FAIL」）。若某文件出现非自检的失败，会被单独标红，不并入有效口径。
 *
 * 用法：
 *   node src/leaderboard.mjs            # 生成 out/leaderboard.html + out/leaderboard.json
 *   node src/leaderboard.mjs --check    # 只校验并打印，不写文件
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'out')
// 第三方插件的结果（npm run eval:ext）写在这里，榜单一起读，靠 origin 字段区分
const OUT_EXTERNAL = join(ROOT, 'out-external')
const SELF_CHECK = /DELIBERATE/i
const CHECK_ONLY = process.argv.includes('--check')

// ---------- 计算 ----------

const pct = (a, b) => (b > 0 ? (a / b) * 100 : null)
const fmtPct = (v) => (v === null ? '—' : v.toFixed(1).replace(/\.0$/, '') + '%')
const median = (arr) => {
  const s = arr.filter((n) => typeof n === 'number').sort((a, b) => a - b)
  if (s.length === 0) return null
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function loadSets() {
  // 本机插件在 out/，第三方在 out-external/；两边都读，来源靠 origin 字段区分
  const files = []
  for (const dir of [OUT, OUT_EXTERNAL]) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'leaderboard.json') continue
      files.push({ file: f, dir })
    }
  }
  files.sort((a, b) => a.file.localeCompare(b.file))

  const sets = []
  for (const { file, dir } of files) {
    let j
    try {
      j = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch {
      continue
    }
    // 只认评测结果：out-external/ 里还可能有别的 JSON（比如第三方扫描记录）
    if (!Array.isArray(j.results)) continue

    const results = j.results

    const selfChecks = results.filter((r) => SELF_CHECK.test(r.id))
    const real = results.filter((r) => !SELF_CHECK.test(r.id))
    const realPassed = real.filter((r) => r.pass).length
    const realFailed = real.filter((r) => !r.pass)

    // 自检用例应当恰好 1 条且必须失败；偏差要报出来，不静默
    const warnings = []
    if (selfChecks.length !== 1) {
      warnings.push(`自检用例 ${selfChecks.length} 条（预期 1 条）`)
    }
    if (selfChecks.some((r) => r.pass)) {
      warnings.push('自检用例竟然通过了（判据可能永远返 true）')
    }
    if (realFailed.length > 0) {
      warnings.push(`有 ${realFailed.length} 条真实失败：${realFailed.map((r) => r.id).join(', ')}`)
    }

    const rawRate = pct(j.passed, j.total)
    const effRate = pct(realPassed, real.length)

    // 与结果文件自带的 passRate 交叉核对（容差 0.15 个百分点，容忍四舍五入）
    if (typeof j.passRate === 'number' && rawRate !== null && Math.abs(j.passRate - rawRate) > 0.15) {
      warnings.push(`文件内 passRate=${j.passRate} 与重算 ${rawRate.toFixed(1)} 不一致`)
    }

    sets.push({
      file,
      plugin: j.plugin ?? file.replace(/\.json$/, ''),
      origin: j.origin ?? (/^mock-/i.test(String(j.plugin ?? '')) ? 'mock' : 'self'),
      repo: j.repo ?? '',
      testedOn: j.testedOn ?? '',
      ranAt: j.ranAt ?? '',
      rawTotal: results.length,
      rawPassed: results.filter((r) => r.pass).length,
      rawRate,
      selfCheckCount: selfChecks.length,
      realTotal: real.length,
      realPassed,
      realFailed,
      effRate,
      medianMs: median(results.map((r) => r.ms)),
      totalMs: results.reduce((s, r) => s + (typeof r.ms === 'number' ? r.ms : 0), 0),
      warnings,
      results,
    })
  }
  return sets
}

function sortSets(sets) {
  return [...sets].sort((a, b) => {
    const ar = a.effRate ?? -1
    const br = b.effRate ?? -1
    if (br !== ar) return br - ar
    if (b.realTotal !== a.realTotal) return b.realTotal - a.realTotal
    return a.plugin.localeCompare(b.plugin)
  })
}

function aggregate(sets) {
  const realTotal = sets.reduce((s, x) => s + x.realTotal, 0)
  const realPassed = sets.reduce((s, x) => s + x.realPassed, 0)
  const rawTotal = sets.reduce((s, x) => s + x.rawTotal, 0)
  const rawPassed = sets.reduce((s, x) => s + x.rawPassed, 0)
  const selfChecks = sets.reduce((s, x) => s + x.selfCheckCount, 0)
  const realFailures = sets.reduce((s, x) => s + x.realFailed.length, 0)

  return {
    realTotal,
    realPassed,
    rawTotal,
    rawPassed,
    selfChecks,
    realFailures,
    effRate: pct(realPassed, realTotal),
    rawRate: pct(rawPassed, rawTotal),
    setCount: sets.length,
    byOrigin: {
      self: sets.filter((s) => s.origin === 'self').length,
      'third-party': sets.filter((s) => s.origin === 'third-party').length,
      mock: sets.filter((s) => s.origin === 'mock').length,
    },
    warnCount: sets.reduce((s, x) => s + x.warnings.length, 0),
  }
}

// ---------- HTML ----------

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const repoLabel = (url) => {
  const m = String(url).match(/github\.com\/([^/]+\/[^/#?]+)/i)
  return m ? m[1] : url.replace(/^https?:\/\//, '')
}

function prettyTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function renderResults(set) {
  const rows = set.results
    .map((r) => {
      const selfCheck = SELF_CHECK.test(r.id)
      const cls = selfCheck ? 'self' : r.pass ? 'pass' : 'fail'
      const tag = selfCheck ? '自检' : r.pass ? '通过' : '失败'
      return `<tr class="${cls}">
        <td class="mark">${tag}</td>
        <td class="mono">${esc(r.id)}</td>
        <td>${esc(r.task)}</td>
        <td class="mono dim">${esc(r.reason ?? (r.error ? 'threw: ' + r.error : ''))}</td>
        <td class="num">${typeof r.ms === 'number' ? r.ms : '—'}</td>
      </tr>`
    })
    .join('\n')

  return `<table class="detail">
    <thead><tr><th style="width:3.2em"></th><th style="width:16em">断言 id</th><th>验证什么</th><th>判据结果</th><th style="width:4em">ms</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`
}

const ORIGIN = {
  self: { label: '自研', cls: 'src-self' },
  'third-party': { label: '第三方', cls: 'src-third' },
  mock: { label: 'mock', cls: 'src-mock' },
}

function renderRow(set) {
  const rateCls = set.effRate === 100 ? 'ok' : set.effRate === null ? 'na' : 'bad'
  const warn = set.warnings.length
    ? ` <span class="warn" title="${esc(set.warnings.join(' / '))}">${set.warnings.length}</span>`
    : ''
  const origin = ORIGIN[set.origin] ?? { label: set.origin ?? '—', cls: '' }
  // mock 是验证评测器自身的本地 fixture，挂仓库链接会误导（它 repo 字段抄了别家的）
  const repo = /^mock-/i.test(set.plugin)
    ? '<span class="dim" title="本地 fixture，不发布">本地 mock</span>'
    : set.repo
      ? `<a href="${esc(set.repo)}" target="_blank" rel="noreferrer">${esc(repoLabel(set.repo))}</a>`
      : '<span class="dim">—</span>'

  return `<tr>
      <td class="plugin">${esc(set.plugin)}${warn}</td>
      <td class="src ${origin.cls}">${esc(origin.label)}</td>
      <td class="num">${set.realPassed}/${set.realTotal}</td>
      <td class="num ${rateCls}">${fmtPct(set.effRate)}</td>
      <td class="num dim">${set.rawPassed}/${set.rawTotal}</td>
      <td class="num dim">${fmtPct(set.rawRate)}</td>
      <td class="num dim">${set.medianMs === null ? '—' : Math.round(set.medianMs)}</td>
      <td class="repo">${repo}</td>
    </tr>
    <tr class="expand"><td colspan="8">
      <details><summary>展开 ${set.realTotal} 条有效断言 + ${set.selfCheckCount} 条自检</summary>
      ${renderResults(set)}
      </details>
    </td></tr>`
}

function renderHtml(sets, agg, generatedAt) {
  const versions = [...new Set(sets.map((s) => s.testedOn).filter(Boolean))]
  const rows = sets.map(renderRow).join('\n')

  const warnBlock = agg.warnCount
    ? `<div class="alert">有 ${agg.warnCount} 条数据告警，见表格中黄色标记。</div>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-runtime-eval · 行为级榜单</title>
<style>
:root{
  --ink:#16181d; --dim:#6b7280; --line:#e5e7eb; --bg:#fcfcfb;
  --ok:#0b6b3a; --bad:#b42318; --self:#8a6d3b; --accent:#1d4ed8;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:40px 24px 72px}
header h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}
header p{margin:0;color:var(--dim)}
.tag{display:inline-block;font-size:12px;padding:1px 8px;border:1px solid var(--line);
  border-radius:999px;color:var(--dim);margin-left:8px;vertical-align:2px}
.hero{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0 8px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card .k{font-size:12px;color:var(--dim);margin-bottom:6px}
.card .v{font-size:24px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.card .s{font-size:12px;color:var(--dim);margin-top:2px}
.big{color:var(--ok)}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);
  border-radius:10px;overflow:hidden}
thead th{text-align:left;font-size:12px;font-weight:600;color:var(--dim);
  background:#f9fafb;padding:9px 12px;border-bottom:1px solid var(--line)}
tbody td{padding:10px 12px;border-bottom:1px solid #f1f3f5;vertical-align:top}
tbody tr:last-child td{border-bottom:none}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ok{color:var(--ok);font-weight:650}
.bad{color:var(--bad);font-weight:650}
.na{color:var(--dim)}
.plugin{font-weight:600}
.src{font-size:12px;white-space:nowrap;color:var(--dim)}
.src-self{color:var(--dim)}
.src-third{color:var(--ok);font-weight:600}
.src-mock{color:var(--self)}
.mono{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:13px}
.dim{color:var(--dim)}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
tr.expand td{padding:0 12px 12px;border-bottom:1px solid #f1f3f5}
details summary{cursor:pointer;font-size:13px;color:var(--dim);padding:2px 0 6px;user-select:none}
details summary:hover{color:var(--ink)}
table.detail{border:1px solid #eef0f2;border-radius:8px;margin-top:4px}
table.detail thead th{background:#fafbfc;font-size:11px;padding:6px 10px}
table.detail tbody td{padding:6px 10px;font-size:13px}
tr.self td{background:#fdfbf4}
tr.self .mark{color:var(--self);font-weight:600}
tr.pass .mark{color:var(--ok)}
tr.fail .mark{color:var(--bad);font-weight:600}
tr.fail td{background:#fef3f2}
.mark{font-size:12px;white-space:nowrap}
.warn{display:inline-block;background:#fef0c7;color:#93370d;border-radius:4px;
  font-size:11px;padding:0 5px;margin-left:6px}
.alert{background:#fef0c7;color:#93370d;border:1px solid #fedf89;border-radius:8px;
  padding:10px 14px;margin:16px 0;font-size:14px}
.note{margin-top:28px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.note h2{font-size:15px;margin:0 0 10px}
.note p{margin:0 0 10px;color:#374151;font-size:14px}
.note p:last-child{margin-bottom:0}
.note code{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:13px;
  font-family:ui-monospace,Consolas,monospace}
footer{margin-top:32px;color:var(--dim);font-size:12.5px;line-height:1.9}
footer code{font-family:ui-monospace,Consolas,monospace}
@media(max-width:720px){
  .hero{grid-template-columns:repeat(2,1fr)}
  .wrap{padding:24px 14px 56px}
  table{font-size:13px}
}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>dsh-runtime-eval · 行为级榜单<span class="tag">实测</span></h1>
  <p>官方测「装不装得上」，这里测「用不用得好」——每个插件跑一组真实任务断言，看它做出来的东西对不对。</p>
</header>

<div class="hero">
  <div class="card">
    <div class="k">有效通过</div>
    <div class="v big">${agg.realPassed}/${agg.realTotal}</div>
    <div class="s">${fmtPct(agg.effRate)} · 已剔除自检</div>
  </div>
  <div class="card">
    <div class="k">断言总数</div>
    <div class="v">${agg.rawTotal}</div>
    <div class="s">含 ${agg.selfChecks} 条自检用例</div>
  </div>
  <div class="card">
    <div class="k">断言集</div>
    <div class="v">${agg.setCount}</div>
    <div class="s">${agg.byOrigin.self} 自研 · ${agg.byOrigin['third-party']} 第三方 · ${agg.byOrigin.mock} mock</div>
  </div>
  <div class="card">
    <div class="k">原始通过率</div>
    <div class="v">${fmtPct(agg.rawRate)}</div>
    <div class="s">${agg.rawPassed}/${agg.rawTotal}，含自检用例</div>
  </div>
</div>

${warnBlock}

<table>
  <thead>
    <tr>
      <th>插件</th>
      <th>来源</th>
      <th class="num">有效断言</th>
      <th class="num">有效通过率</th>
      <th class="num">原始</th>
      <th class="num">原始率</th>
      <th class="num">中位耗时</th>
      <th>仓库</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<div class="note">
  <h2>为什么有两个通过率</h2>
  <p>每个断言集都含一条 <code>DELIBERATE-FAIL</code>：一条故意写错、必须失败的断言。它的作用是证明判据引擎真的会判失败——否则一个永远返回 <code>true</code> 的评测器也能报告 100%。</p>
  <p>所以表格里的「有效通过率」剔除这条自检用例，代表插件真实表现；「原始」列是含自检用例的数字，也就是直接跑 <code>npm run eval:all</code> 时终端里看到的那个。两个数字都对，口径不同。</p>
  <p>若出现非自检的真实失败，会被单独标红并计入「有效通过率」，不并入自检口径。</p>
</div>

<footer>
  生成时间：${esc(prettyTime(generatedAt))}　·　数据源：<code>out/*.json</code>（${agg.setCount} 个结果文件）　·　测试环境：${esc(versions.join('、') || '—')}<br>
  复现：<code>npm run eval:all</code> 然后 <code>npm run leaderboard</code>　·　数字全部由脚本从 JSON 现算，无手填
</footer>
</div>
</body>
</html>
`
}

// ---------- main ----------

const sets = sortSets(loadSets())
if (sets.length === 0) {
  console.error('[fatal] out/ 下没有结果 JSON，先跑 npm run eval:all')
  process.exit(2)
}

const agg = aggregate(sets)
const generatedAt = new Date().toISOString()

if (CHECK_ONLY) {
  for (const s of sets) {
    console.log(
      `${s.plugin.padEnd(26)} ${String(s.realPassed + '/' + s.realTotal).padEnd(8)} ` +
        `${fmtPct(s.effRate).padStart(6)}  raw ${String(s.rawPassed + '/' + s.rawTotal).padEnd(7)} ` +
        `${fmtPct(s.rawRate).padStart(6)}  self=${s.selfCheckCount}` +
        (s.warnings.length ? `  WARN: ${s.warnings.join(' / ')}` : '')
    )
  }
  console.log(
    `\n合计  有效 ${agg.realPassed}/${agg.realTotal} (${fmtPct(agg.effRate)})` +
      `   原始 ${agg.rawPassed}/${agg.rawTotal} (${fmtPct(agg.rawRate)})` +
      `   自检 ${agg.selfChecks}   真实失败 ${agg.realFailures}   告警 ${agg.warnCount}`
  )
  process.exit(agg.realFailures > 0 || agg.warnCount > 0 ? 1 : 0)
}

const summary = {
  generatedAt,
  aggregate: agg,
  sets: sets.map(({ results, ...rest }) => rest),
}

writeFileSync(join(OUT, 'leaderboard.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8')
writeFileSync(join(OUT, 'leaderboard.html'), renderHtml(sets, agg, generatedAt), 'utf8')

console.log(`有效通过  ${agg.realPassed}/${agg.realTotal}  (${fmtPct(agg.effRate)})`)
console.log(`原始通过  ${agg.rawPassed}/${agg.rawTotal}  (${fmtPct(agg.rawRate)})，含 ${agg.selfChecks} 条自检`)
console.log(`断言集    ${agg.setCount} 个（${agg.byOrigin.self} 自研 + ${agg.byOrigin['third-party']} 第三方 + ${agg.byOrigin.mock} mock）`)
console.log(`真实失败  ${agg.realFailures}`)
console.log(`告警      ${agg.warnCount}`)
console.log('')
console.log('out: out/leaderboard.html')
console.log('     out/leaderboard.json')
for (const s of sets) {
  if (s.warnings.length) console.log(`  [warn] ${s.plugin}: ${s.warnings.join(' / ')}`)
}
process.exit(agg.realFailures > 0 ? 1 : 0)
