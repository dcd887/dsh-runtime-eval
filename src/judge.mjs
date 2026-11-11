/**
 * 判据引擎：把「期望」和「实际结果」比对。
 *
 * 支持的 expect 形状：
 *   { equals: 12 }                          // 严格相等（数字/字符串/布尔）
 *   { jsonPath: "$.pages", equals: 12 }     // 取 JSON 字段后相等
 *   { containsAll: ["a", "b"] }             // 文本包含全部
 *   { containsNone: ["x"] }                 // 文本不含任何一个
 *   { lengthAtLeast: 1 }                    // 数组/字符串长度
 *   { matches: "^\\d+$" }                   // 正则
 *   { isError: true }                       // 期望抛错
 *   { isEmpty: true }                       // 期望空字符串/空数组
 */

/** 极简 JSON path：只支持 `$.a.b[0].c` */
export function pick(value, path) {
  if (!path || path === '$') return value
  let cur = value
  for (const seg of path.replace(/^\$\./, '').split('.')) {
    if (cur == null) return undefined
    const m = seg.match(/^([^[]*)(?:\[(\d+)\])?$/)
    if (!m) return undefined
    if (m[1]) cur = cur[m[1]]
    if (m[2] !== undefined) cur = Array.isArray(cur) ? cur[Number(m[2])] : undefined
  }
  return cur
}

function asText(value) {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * 判一条断言。
 * @param {{ expect: object }} assertion
 * @param {{ ok: boolean, value?: any, error?: string }} actual
 * @returns {{ pass: boolean, reason: string }}
 */
export function judge(assertion, actual) {
  const expect = assertion.expect ?? {}
  const reasons = []

  // 1. 期望抛错
  if (expect.isError === true) {
    return actual.ok
      ? { pass: false, reason: `expected an error, but got a value: ${asText(actual.value).slice(0, 120)}` }
      : { pass: true, reason: `threw as expected: ${String(actual.error).slice(0, 100)}` }
  }

  // 2. 期望不抛错，但抛了
  if (!actual.ok) {
    return { pass: false, reason: `unexpected error: ${String(actual.error).slice(0, 160)}` }
  }

  // 3. 取字段
  const subject = expect.jsonPath ? pick(actual.value, expect.jsonPath) : actual.value

  // 4. equals
  if ('equals' in expect) {
    const pass = subject === expect.equals
    reasons.push(`equals: ${pass ? 'ok' : `${JSON.stringify(subject)} !== ${JSON.stringify(expect.equals)}`}`)
    return { pass, reason: reasons.join('; ') }
  }

  // 5. 文本类
  const text = asText(subject)
  let textChecked = false

  if (expect.containsAll) {
    textChecked = true
    const missing = expect.containsAll.filter((t) => !text.includes(t))
    reasons.push(missing.length ? `missing: ${missing.join(', ')}` : 'containsAll: ok')
    if (missing.length) return { pass: false, reason: reasons.join('; ') }
  }

  if (expect.containsNone) {
    textChecked = true
    const found = expect.containsNone.filter((t) => text.includes(t))
    reasons.push(found.length ? `should not contain: ${found.join(', ')}` : 'containsNone: ok')
    if (found.length) return { pass: false, reason: reasons.join('; ') }
  }

  // 两个文本判据都通过了：直接判通过，不要掉到下面的兜底
  if (textChecked) return { pass: true, reason: reasons.join('; ') }

  if (expect.matches) {
    const re = new RegExp(expect.matches)
    const pass = re.test(text)
    reasons.push(`matches /${expect.matches}/: ${pass ? 'ok' : 'no'}`)
    return { pass, reason: reasons.join('; ') }
  }

  if ('lengthAtLeast' in expect) {
    const len = subject?.length ?? -1
    const pass = len >= expect.lengthAtLeast
    reasons.push(`length ${len} >= ${expect.lengthAtLeast}: ${pass ? 'ok' : 'no'}`)
    return { pass, reason: reasons.join('; ') }
  }

  // 数字比较（和 lengthAtLeast 区分：这个直接比数值，不取 .length）
  if ('atLeast' in expect) {
    const pass = typeof subject === 'number' && subject >= expect.atLeast
    reasons.push(`${JSON.stringify(subject)} >= ${expect.atLeast}: ${pass ? 'ok' : 'no'}`)
    return { pass, reason: reasons.join('; ') }
  }

  if ('atMost' in expect) {
    const pass = typeof subject === 'number' && subject <= expect.atMost
    reasons.push(`${JSON.stringify(subject)} <= ${expect.atMost}: ${pass ? 'ok' : 'no'}`)
    return { pass, reason: reasons.join('; ') }
  }

  if (expect.isEmpty === true) {
    const empty = subject == null || subject === '' || (Array.isArray(subject) && subject.length === 0)
    reasons.push(`empty: ${empty ? 'ok' : 'no'}`)
    return { pass: empty, reason: reasons.join('; ') }
  }

  // 6. 只有 jsonPath 没有判据 —— 只验「字段存在」
  if (expect.jsonPath) {
    const exists = subject !== undefined && subject !== null
    return { pass: exists, reason: `${expect.jsonPath} exists: ${exists ? 'ok' : 'no'}` }
  }

  return { pass: false, reason: 'no judgement given in expect' }
}
